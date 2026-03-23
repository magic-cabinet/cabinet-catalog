import { Effect, Context, Layer, Schema, Data } from "effect"

// --- Errors ---

export class OdooError extends Data.TaggedError("OdooError")<{
  message: string
  code?: number
}> {}

// --- Config ---

export class OdooConfig extends Context.Tag("OdooConfig")<
  OdooConfig,
  {
    readonly url: string
    readonly db: string
    readonly username: string
    readonly password: string
  }
>() {}

export const OdooConfigFromEnv = Layer.succeed(OdooConfig, {
  url: Bun.env.ODOO_URL!,
  db: Bun.env.ODOO_DB!,
  username: Bun.env.ODOO_USERNAME!,
  password: Bun.env.ODOO_PASSWORD!,
})

// --- JSON-RPC helpers ---

let requestId = 0

const jsonRpc = (url: string, service: string, method: string, args: unknown[]) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${url}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++requestId,
          method: "call",
          params: { service, method, args },
        }),
      })
      const json = (await res.json()) as any
      if (json.error) {
        throw new OdooError({
          message: json.error.data?.message ?? json.error.message ?? "Unknown Odoo error",
          code: json.error.code,
        })
      }
      return json.result
    },
    catch: (e) =>
      e instanceof OdooError
        ? e
        : new OdooError({ message: String(e) }),
  })

// --- Client ---

export class OdooClient extends Context.Tag("OdooClient")<
  OdooClient,
  {
    readonly uid: number
    readonly call: (
      model: string,
      method: string,
      args: unknown[],
      kwargs?: Record<string, unknown>
    ) => Effect.Effect<any, OdooError>
  }
>() {}

export const OdooClientLive = Layer.effect(
  OdooClient,
  Effect.gen(function* () {
    const config = yield* OdooConfig

    // Authenticate
    const uid = yield* jsonRpc(config.url, "common", "login", [
      config.db,
      config.username,
      config.password,
    ])

    if (!uid) {
      return yield* new OdooError({ message: "Authentication failed — check credentials" })
    }

    yield* Effect.log(`Authenticated as uid=${uid}`)

    return {
      uid,
      call: (model, method, args, kwargs = {}) =>
        jsonRpc(config.url, "object", "execute_kw", [
          config.db,
          uid,
          config.password,
          model,
          method,
          args,
          kwargs,
        ]),
    }
  })
)

// Convenience: full layer from env
export const OdooLive = OdooClientLive.pipe(Layer.provide(OdooConfigFromEnv))
