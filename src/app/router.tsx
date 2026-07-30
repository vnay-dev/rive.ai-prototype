import { createBrowserRouter } from "react-router-dom"

export const router = createBrowserRouter([
  {
    path: "/",
    lazy: async () => {
      const { HomePage } = await import("@/pages/home")
      return { Component: HomePage }
    },
  },
])
