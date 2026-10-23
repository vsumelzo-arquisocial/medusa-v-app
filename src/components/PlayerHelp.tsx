import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CircleHelp, BookOpen, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PLAYER_HELP, helpTopic } from "@/lib/player-help";

export function PlayerHelp() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const topic = helpTopic(pathname);
  const tutorial = PLAYER_HELP[topic] ?? PLAYER_HELP["inicio"];
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  if (!tutorial) return null;
  const currentStep = Math.min(step, tutorial.steps.length - 1);

  return <Sheet open={open} onOpenChange={(value) => { setOpen(value); if (value) setStep(0); }}>
    <SheetTrigger asChild>
      <Button variant="outline" className="fixed bottom-4 right-4 z-40 gap-2 border-primary bg-background text-primary shadow-lg print:hidden" aria-label="Abrir ayuda de esta pantalla"><CircleHelp className="size-4" />Ayuda</Button>
    </SheetTrigger>
    <SheetContent className="flex w-full flex-col gap-5 overflow-y-auto pb-10 sm:max-w-lg">
      <SheetHeader className="pr-6 text-left">
        <SheetTitle className="flex items-center gap-2 text-primary"><BookOpen className="size-5 shrink-0" />{tutorial.title}</SheetTitle>
        <SheetDescription>Guía para jugadores · Atalaya</SheetDescription>
      </SheetHeader>
      <section aria-label="Tutorial de esta pantalla" className="space-y-4 border-y border-border py-5">
        <p className="text-xs uppercase text-muted-foreground">Paso {currentStep + 1} de {tutorial.steps.length}</p>
        <p className="min-h-24 text-sm leading-relaxed" aria-live="polite">{tutorial.steps[currentStep]}</p>
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" disabled={currentStep === 0} onClick={() => setStep(currentStep - 1)}><ArrowLeft className="size-4" />Anterior</Button>
          {currentStep < tutorial.steps.length - 1 ? <Button size="sm" onClick={() => setStep(currentStep + 1)}>Siguiente<ArrowRight className="size-4" /></Button> : <Button size="sm" onClick={() => setOpen(false)}>Entendido</Button>}
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm text-primary">Ten en cuenta</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{tutorial.important}</p>
      </section>
      <Accordion type="single" collapsible>
        <AccordionItem value="all-steps"><AccordionTrigger>Ver todos los pasos</AccordionTrigger><AccordionContent><ol className="list-decimal space-y-3 pl-5 text-muted-foreground">{tutorial.steps.map((text) => <li key={text}>{text}</li>)}</ol></AccordionContent></AccordionItem>
        <AccordionItem value="first-steps"><AccordionTrigger>¿Por dónde empiezo?</AccordionTrigger><AccordionContent><ol className="list-decimal space-y-3 pl-5 text-muted-foreground">{PLAYER_HELP["inicio"]?.steps.map((text) => <li key={text}>{text}</li>)}</ol></AccordionContent></AccordionItem>
      </Accordion>
    </SheetContent>
  </Sheet>;
}