import { z } from 'zod';

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
});

// Validate public environment variables
const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsedPublic.success) {
  console.error('❌ Invalid public environment variables:', parsedPublic.error.format());
  throw new Error('Invalid public environment variables');
}

export const publicEnv = Object.freeze(parsedPublic.data);

export type ServerEnv = z.infer<typeof serverSchema>;

let validatedServerEnv: ServerEnv;

if (typeof window === 'undefined') {
  // Validate server environment variables only on server side
  const parsedServer = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  });

  if (!parsedServer.success) {
    console.error('❌ Invalid server environment variables:', parsedServer.error.format());
    throw new Error('Invalid server environment variables');
  }

  validatedServerEnv = Object.freeze(parsedServer.data);
} else {
  // On the client, specifically block access to sensitive server keys without breaking bundler properties checks
  const serverKeys = new Set(['SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
  validatedServerEnv = new Proxy({} as ServerEnv, {
    get(target, prop) {
      if (typeof prop === 'string' && serverKeys.has(prop)) {
        throw new Error(`Security Error: Cannot access server environment variable "${prop}" on the client.`);
      }
      return Reflect.get(target, prop);
    },
  });
}

export const serverEnv = validatedServerEnv;
