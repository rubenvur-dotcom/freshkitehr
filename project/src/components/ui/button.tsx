import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]/40 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        /* Solid CTA — main submit actions */
        default: 'btn-solid',
        /* Ghost glass — secondary actions */
        glass: 'btn-glass',
        /* Neutral cancel */
        outline: 'btn-cancel',
        /* Destructive */
        destructive: 'bg-[#EF4444] text-white rounded-xl shadow-sm hover:bg-red-600 hover:-translate-y-px',
        secondary: 'bg-[#CCFBF1] text-[#0D9488] rounded-xl hover:bg-[#99F6E4]',
        ghost: 'text-[#0D9488] hover:bg-[#F0FDFA] rounded-xl',
        link: 'text-[#0D9488] underline-offset-4 hover:underline',
      },
      size: {
        default: '',
        sm: 'px-3 py-1.5 text-xs rounded-lg',
        lg: 'px-6 py-3 text-base',
        icon: 'w-9 h-9 p-0 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
