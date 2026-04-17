import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type EmployeeRow = {
  firstName: string;
  lastName: string;
  email: string;
  area: string;
  password: string;
};

type AuthUserSummary = {
  id: string;
  email?: string;
};

export const runtime = "nodejs";

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function parseCsvLine(line: string, separator: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"' && inQuotes) {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === separator && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function detectSeparator(headerLine: string): string {
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function getField(row: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const value = row[normalizeHeader(name)];
    if (value) return value.trim();
  }
  return "";
}

function parseEmployeesCsv(csv: string): { rows: EmployeeRow[]; errors: string[] } {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: ["El CSV debe tener encabezados y al menos una fila de empleados."] };
  }

  const separator = detectSeparator(lines[0]);
  const headers = parseCsvLine(lines[0], separator).map(normalizeHeader);
  const rows: EmployeeRow[] = [];
  const errors: string[] = [];

  lines.slice(1).forEach((line, index) => {
    const values = parseCsvLine(line, separator);
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));
    const rowNumber = index + 2;
    const employee = {
      firstName: getField(row, ["nombre", "first_name", "firstname"]),
      lastName: getField(row, ["apellido", "last_name", "lastname"]),
      email: getField(row, ["email", "mail", "correo"]).toLowerCase(),
      area: getField(row, ["area", "área", "sector", "equipo"]),
      password: getField(row, ["password", "contraseña", "contrasena", "clave"]),
    };

    if (!employee.firstName || !employee.lastName || !employee.email || !employee.password) {
      errors.push(`Fila ${rowNumber}: faltan nombre, apellido, email o password.`);
      return;
    }

    if (!employee.email.includes("@")) {
      errors.push(`Fila ${rowNumber}: email invalido.`);
      return;
    }

    if (employee.password.length < 6) {
      errors.push(`Fila ${rowNumber}: la contraseña debe tener al menos 6 caracteres.`);
      return;
    }

    rows.push(employee);
  });

  return { rows, errors };
}

async function getAuthUsersByEmail(supabase: SupabaseClient): Promise<Map<string, AuthUserSummary>> {
  const usersByEmail = new Map<string, AuthUserSummary>();
  const perPage = 1000;

  for (let page = 1; page < 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    for (const user of data.users) {
      if (user.email) {
        usersByEmail.set(user.email.toLowerCase(), { id: user.id, email: user.email });
      }
    }

    if (data.users.length < perPage) break;
  }

  return usersByEmail;
}

export async function POST(request: Request) {
  const { adminPin, csv } = (await request.json()) as { adminPin?: string; csv?: string };
  const expectedPin = process.env.ADMIN_PIN ?? process.env.NEXT_PUBLIC_ADMIN_PIN ?? "admin123";

  if (adminPin !== expectedPin) {
    return NextResponse.json({ error: "PIN administrador incorrecto." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en las variables de entorno." },
      { status: 500 },
    );
  }

  const { rows, errors } = parseEmployeesCsv(csv ?? "");
  if (!rows.length) {
    return NextResponse.json({ error: errors.join(" ") || "No se encontraron empleados para importar." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const authUsersByEmail = await getAuthUsersByEmail(supabase);
  const { data: existingProfiles, error: profilesError } = await supabase
    .from("users")
    .select("id,email")
    .in(
      "email",
      rows.map((row) => row.email),
    );

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const profilesByEmail = new Map<string, { id: string; email: string }>(
    (existingProfiles ?? []).map((profile) => [String(profile.email).toLowerCase(), profile as { id: string; email: string }]),
  );

  let authCreated = 0;
  let profilesCreated = 0;
  let profilesUpdated = 0;

  for (const row of rows) {
    try {
      let authUserId = authUsersByEmail.get(row.email)?.id;

      if (!authUserId) {
        const { data, error } = await supabase.auth.admin.createUser({
          email: row.email,
          password: row.password,
          email_confirm: true,
          user_metadata: {
            firstName: row.firstName,
            lastName: row.lastName,
            area: row.area,
          },
        });

        if (error || !data.user) {
          errors.push(`${row.email}: ${error?.message ?? "no se pudo crear el usuario."}`);
          continue;
        }

        authUserId = data.user.id;
        authUsersByEmail.set(row.email, { id: authUserId, email: row.email });
        authCreated += 1;
      }

      const existingProfile = profilesByEmail.get(row.email);
      const profileId = existingProfile?.id ?? authUserId;
      const { error: profileError } = await supabase.from("users").upsert(
        {
          id: profileId,
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email,
          area: row.area || null,
        },
        { onConflict: "id" },
      );

      if (profileError) {
        errors.push(`${row.email}: ${profileError.message}`);
        continue;
      }

      if (existingProfile) {
        profilesUpdated += 1;
      } else {
        profilesCreated += 1;
        profilesByEmail.set(row.email, { id: profileId, email: row.email });
      }
    } catch (error) {
      errors.push(`${row.email}: ${error instanceof Error ? error.message : "error inesperado."}`);
    }
  }

  return NextResponse.json({
    authCreated,
    profilesCreated,
    profilesUpdated,
    errors,
    processed: rows.length,
  });
}
