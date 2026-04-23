import React from 'react';
import './ConnectionStatus.css';

const ConnectionStatus = ({ socketConnected, isAuthenticated, isSending }) => {
  const getStatusColor = () => {
    if (!isAuthenticated) return '#ff6b6b';
    if (socketConnected) return '#51cf66';
    return '#ffa500';
  };

  const getStatusText = () => {
    if (!isAuthenticated) return 'Not Authenticated';
    if (socketConnected) return 'Connected';
    return 'Connecting...';
  };

  return (
    <div className="connection-status" style={{ '--status-color': getStatusColor() }}>
      <div className="status-dot" />
      <span className="status-text">{getStatusText()}</span>
    </div>
  );
};

export default ConnectionStatus;
