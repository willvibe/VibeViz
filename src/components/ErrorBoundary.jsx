import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(_error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        if (this.props.onReset) {
            this.props.onReset();
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
                    <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full p-8 border border-white/50">
                        <div className="flex items-center gap-3 text-red-500 mb-5">
                            <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <h2 className="text-2xl font-bold text-slate-900">出错了</h2>
                        </div>
                        <p className="text-slate-600 mb-6">
                            应用程序遇到了一个错误。请尝试刷新页面或重置应用。
                        </p>
                        {import.meta.env.DEV && this.state.error && (
                            <div className="bg-slate-100 rounded-lg p-4 mb-6 overflow-auto max-h-48">
                                <p className="text-sm font-mono text-red-600 mb-2">{this.state.error.toString()}</p>
                                <pre className="text-xs text-slate-600">{this.state.errorInfo?.componentStack}</pre>
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={this.handleReset}
                                className="flex-1 bg-slate-900/90 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-md"
                            >
                                重置应用
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="flex-1 bg-blue-500/90 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-blue-600 transition-all shadow-md"
                            >
                                刷新页面
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
