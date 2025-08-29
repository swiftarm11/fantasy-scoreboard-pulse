import React from 'react';
import MinimalDashboard from '../components/MinimalDashboard';
// import { FantasyDashboard } from '../components/FantasyDashboard';

const Index = () => {
  console.log('🔥 Index: Component rendering');
  
  return (
    <div className="min-h-screen">
      <MinimalDashboard />
      {/* Temporarily replace FantasyDashboard with MinimalDashboard to test for re-render loops */}
      {/* <FantasyDashboard /> */}
    </div>
  );
};

export default Index;