import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:"Student Calendar | Term V",
  description:"Select Term V subjects, match the official timetable and build your personal calendar."
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body>{children}</body></html>;
}