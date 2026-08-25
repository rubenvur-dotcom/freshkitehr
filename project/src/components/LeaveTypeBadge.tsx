import React from 'react';
import { cn, getLeaveTypeColor, getStatusColor } from '../lib/utils';

interface BadgeProps {
  value: string;
  variant?: 'leaveType' | 'status';
  className?: string;
}

export const LeaveTypeBadge: React.FC<BadgeProps> = ({ value, variant = 'leaveType', className }) => {
  const colorClass = variant === 'status' ? getStatusColor(value) : getLeaveTypeColor(value);
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border', colorClass, className)}>
      {value}
    </span>
  );
};
