"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    value?: number | null;
  }
>(({ className, value = 0, ...props }, ref) => {
  const safeValue = value ?? 0;
  const [animatedValue, setAnimatedValue] = React.useState(0);

  React.useEffect(() => {
    let currentValue = 0;
    const interval = setInterval(() => {
      currentValue += 0.75;
      if (currentValue >= safeValue) {
        currentValue = safeValue;
        clearInterval(interval);
      }
      setAnimatedValue(currentValue);
    }, 20);

    return () => clearInterval(interval);
  }, [safeValue]);

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-primary transition-transform duration-100 ease-out"
        style={{ transform: `translateX(-${100 - animatedValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
