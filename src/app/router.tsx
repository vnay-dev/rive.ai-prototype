import { createBrowserRouter } from "react-router-dom"

export const router = createBrowserRouter([
  {
    path: "/",
    lazy: async () => {
      const { LandingPage } = await import("@/pages/landing")
      return { Component: LandingPage }
    },
  },
  {
    path: "/version1",
    lazy: async () => {
      const { Version1Page } = await import("@/pages/version1")
      return { Component: Version1Page }
    },
  },
  {
    path: "/version2",
    lazy: async () => {
      const { Version2Page } = await import("@/pages/version2")
      return { Component: Version2Page }
    },
  },
  {
    path: "/version3",
    lazy: async () => {
      const { Version3Page } = await import("@/pages/version3")
      return { Component: Version3Page }
    },
  },
  {
    path: "/version4",
    lazy: async () => {
      const { Version4Page } = await import("@/pages/version4")
      return { Component: Version4Page }
    },
  },
  {
    path: "/version5",
    lazy: async () => {
      const { Version5Layout } = await import("@/pages/version5")
      return { Component: Version5Layout }
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const { Version5JobsPage } = await import("@/pages/version5")
          return { Component: Version5JobsPage }
        },
      },
      {
        path: "jobs/:jobId",
        lazy: async () => {
          const { Version5Workspace } = await import("@/pages/version5")
          return { Component: Version5Workspace }
        },
      },
    ],
  },
])
