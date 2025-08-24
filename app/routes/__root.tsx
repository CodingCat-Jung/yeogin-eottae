// app/routes/__root.tsx
import { type ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  ParsedLocation,
} from '@tanstack/react-router'

import { Store } from "@tanstack/react-store";

import appCss from "@/styles/app.css?url";
import Header from '@/components/Header';
import Title from '@/components/Title';

export type Session = {
  user_id: number | undefined,
  nickname: string | undefined
}

export const titleInfo = new Store<{
  type: "h1" | "p",
  text: string,
  name: undefined | string
}>({
  type: "p",
  text: "Let's plan your travel!",
  name: undefined
});

export const session = new Store<Session>({ user_id: undefined, nickname: undefined });

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Travia',
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  component: RootComponent,
  loader: ({ location }) => { return location; },
  ssr: true
})

function RootComponent() {
  const data = Route.useLoaderData();

  return (
    <RootDocument data={data}>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ data, children }: { data: ParsedLocation; readonly children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Header session={session} uri={data} />
        <main className="p-4 flex gap-4 flex-wrap lg:flex-nowrap">
          <Title info={titleInfo} />
          {children}
        </main>
        <Scripts />
      </body>
    </html>
  )
}