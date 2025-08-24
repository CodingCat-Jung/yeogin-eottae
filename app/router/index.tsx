import { createBrowserRouter } from "react-router-dom";
import RootLayout from "../layouts/RootLayout";
import Home from "../routes/index"; // "여긴 어때" 첫 화면
//import Step1 from "../routes/step1";
import Login from "../routes/login";
// 나중에 step2, step3, result 등도 추가 가능

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
    //q  { path: "step1", element: <Step1 /> },
      { path: "login", element: <Login /> },
      // 더 추가 예정
    ],
  },
]);
