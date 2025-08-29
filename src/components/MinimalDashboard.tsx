import React from 'react';

const MinimalDashboard = () => {
  console.log('🔥 MinimalDashboard: Rendering');
  
  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <h1 className="text-3xl font-bold text-foreground mb-4">
        Fantasy Dashboard (Minimal)
      </h1>
      <div className="space-y-4">
        <p>This is a minimal dashboard to test for re-render loops.</p>
        <div className="bg-card p-4 rounded border">
          <h2 className="text-xl font-semibold">Test Card</h2>
          <p>If you can see this without infinite re-renders, the issue is in the hooks.</p>
        </div>
      </div>
    </div>
  );
};

export default MinimalDashboard;