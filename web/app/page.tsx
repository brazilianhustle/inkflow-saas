import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import Stats from "@/components/landing/Stats";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
    </main>
  );
}
