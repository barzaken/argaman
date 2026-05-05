"use client";

import { useActionState } from "react";

import Link from "next/link";
import { AtSignIcon, ChevronLeftIcon, LockIcon } from "lucide-react";

import { loginAction, type LoginState } from "./actions";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { FloatingPaths } from "@/components/ui/floating-paths";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState<
    LoginState | undefined,
    FormData
  >(loginAction, undefined);

  return (
    <main className="relative md:h-screen md:overflow-hidden lg:grid lg:grid-cols-2">
      <div className="relative hidden h-full flex-col border-r bg-secondary p-10 lg:flex dark:bg-secondary/20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
        <Logo className="relative z-10 mr-auto h-12 w-auto" />

        <div className="relative z-10 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-xl leading-snug text-secondary-foreground">
              &ldquo;This platform has helped me save time and serve clients
              faster than ever.&rdquo;
            </p>
            <footer className="font-mono font-semibold text-sm text-muted-foreground">
              — Team Argaman
            </footer>
          </blockquote>
        </div>
        <div className="absolute inset-0">
          <FloatingPaths position={1} />
          <FloatingPaths position={-1} />
        </div>
      </div>

      <div className="relative flex min-h-screen flex-col justify-center px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 isolate -z-10 opacity-60 [contain:strict]"
        >
          <div className="absolute top-0 right-0 h-[320px] w-[140px] -translate-y-[87.5%] rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,color-mix(in_oklab,var(--foreground)_6%,transparent)_0,color-mix(in_oklab,var(--foreground)_2%,transparent)_50%,color-mix(in_oklab,var(--foreground)_1%,transparent)_80%)]" />
          <div className="absolute top-0 right-0 h-[320px] w-[60px] rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_oklab,var(--foreground)_4%,transparent)_0,color-mix(in_oklab,var(--foreground)_1%,transparent)_80%,transparent_100%)] [translate:5%_-50%]" />
          <div className="absolute top-0 right-0 h-[320px] w-[60px] -translate-y-[87.5%] rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_oklab,var(--foreground)_4%,transparent)_0,color-mix(in_oklab,var(--foreground)_1%,transparent)_80%,transparent_100%)]" />
        </div>



        <div className="mx-auto w-full max-w-sm space-y-4 sm:max-w-sm">
          <Logo className="h-12 w-auto lg:hidden" />

          <div className="flex flex-col space-y-1">
            <h1 className="font-bold text-2xl tracking-wide text-foreground">
              כניסה לארגמן CRM
            </h1>
            <p className="text-base text-muted-foreground">
              התחברו עם האימייל והסיסמה שלכם.
            </p>
          </div>

          <form action={formAction} className="space-y-2">
            <p className="text-start text-muted-foreground text-xs">
              פרטי התחברות
            </p>

            <InputGroup className="h-10 min-h-10">
              <InputGroupAddon align="inline-start">
                <AtSignIcon className="text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                name="email"
                type="email"
                autoComplete="email"
                required
                dir="ltr"
                placeholder="your.email@example.com"
                className="h-10 text-start"
              />
            </InputGroup>

            <InputGroup className="h-10 min-h-10">
              <InputGroupAddon align="inline-start">
                <LockIcon className="text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                name="password"
                type="password"
                autoComplete="current-password"
                required
                dir="ltr"
                placeholder="••••••••"
                className="h-10 text-start"
              />
            </InputGroup>

            {state && !state.ok ? (
              <p className="text-destructive text-sm" role="alert">
                {state.message}
              </p>
            ) : null}

            <Button className="w-full" disabled={isPending} type="submit">
              {isPending ? "מתחברים…" : "התחברות"}
            </Button>
          </form>

          <p className="mt-8 text-muted-foreground text-sm">
            בלחיצה על התחברות הנכם מאשרים את{" "}
            <Link
              className="underline underline-offset-4 hover:text-primary"
              href="#"
            >
              תנאי השירות
            </Link>
            {" ואת "}
            <Link
              className="underline underline-offset-4 hover:text-primary"
              href="#"
            >
              מדיניות הפרטיות
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
