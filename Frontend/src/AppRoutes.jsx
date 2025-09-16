import { BrowserRouter, Routes, Route } from 'react-router-dom'
import React from 'react'
import Home from './pages/Home'
import Register from './pages/Register'
import Login from './pages/Login'
import { useAuth } from './AuthContext.jsx'
import { Navigate, useLocation } from 'react-router-dom'

function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) return <div style={{padding: '2rem'}}>Loading...</div>;
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
    return children;
}

const AppRoutes = () => {
    return (

        <BrowserRouter>
            <Routes>
                <Route path='/' element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path='/register' element={<Register />} />
                <Route path='/login' element={<Login />} />
            </Routes>
        </BrowserRouter>
    )
}

export default AppRoutes