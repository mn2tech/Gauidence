import type { Metadata } from "next";
import PublicCovenantLifeAssistant from "./PublicCovenantLifeAssistant";

export const metadata: Metadata = {
  title: "Ask about Covenant Life School — Guardian",
  description:
    "Ask Gideon about approved public Covenant Life School information for families.",
};

export default function CovenantLifePublicPage() {
  return <PublicCovenantLifeAssistant />;
}
