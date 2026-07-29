import { RECRUIT_STEPS, RECRUIT_STEP_LABELS, type RecruitStep } from "@/lib/recruit/types";

type Props = {
  currentStep: RecruitStep;
  onStepClick?: (step: RecruitStep) => void;
};

export default function RecruitStepNav({ currentStep, onStepClick }: Props) {
  const currentIndex = RECRUIT_STEPS.indexOf(currentStep);

  return (
    <nav className="flex flex-wrap gap-2">
      {RECRUIT_STEPS.map((step, i) => {
        const isActive = step === currentStep;
        const isComplete = i < currentIndex;
        return (
          <button
            key={step}
            type="button"
            onClick={() => onStepClick?.(step)}
            disabled={!onStepClick}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? "bg-brand text-white"
                : isComplete
                  ? "bg-brand-light text-brand-dark"
                  : "bg-stone-100 text-stone-500"
            } ${onStepClick ? "cursor-pointer hover:opacity-90" : "cursor-default"}`}
          >
            {i + 1}. {RECRUIT_STEP_LABELS[step]}
          </button>
        );
      })}
    </nav>
  );
}
