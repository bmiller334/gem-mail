import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Mail, AlertCircle, CheckCircle2, TrendingUp, Activity, Tag, Clock, ThumbsUp, ThumbsDown, RefreshCw, Play } from 'lucide-react';

// --- COMPONENTS ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-slate-800 border border-slate-700 rounded-lg p-4 ${className}`}>
    {children}
  </div>
);

const StatCard = ({ title, value, subtext, icon: Icon, trend }) => (
  <Card>
    <div className="flex justify-between items-start">
      <div>
        <h3 className="text-slate-400 text-sm font-medium mb-1">{title}</h3>
        <div className="text-2xl font-bold text-white">{value}</div>
        {subtext && <div className="text-xs text-slate-500 mt-1">{subtext}</div>}
      </div>
      <div className={`p-2 rounded-full ${trend === 'up' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
        <Icon size={20} />
      </div>
    </div>
  </Card>
);

const FeedItem = ({ log, onFeedback }) => {
  const urgencyColor = {
    'High': 'text-red-400 border-red-400/30 bg-red-400/10',
    'Medium': 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
    'Low': 'text-slate-400 border-slate-400/30 bg-slate-400/10'
  };

  const handleFeedback = (isPositive) => {
    onFeedback(log.id, isPositive);
  };

  return (
    <div className="border-b border-slate-700 py-3 last:border-0 hover:bg-slate-800/50 transition-colors px-2 rounded group">
      <div className="flex justify-between items-start mb-1">
        <span className="font-semibold text-slate-200 truncate pr-2">{log.sender}</span>
        <span className="text-xs text-slate-500 whitespace-nowrap">
          {log.processedDate?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </span>
      </div>
      <div className="text-sm text-slate-300 mb-2 truncate">{log.subject}</div>
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center text-xs">
          <span className={`px-2 py-0.5 rounded border ${urgencyColor[log.aiResponse?.urgency] || urgencyColor['Low']}`}>
            {log.aiResponse?.urgency || 'Low'}
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {log.appliedLabel}
          </span>
        </div>
        
        {/* Feedback Controls */}
        <div className="flex gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => handleFeedback(true)}
            className={`p-1 rounded hover:bg-slate-700 transition-colors ${log.feedback === 'positive' ? 'text-green-400 opacity-100' : 'text-slate-500'}`}
            title="Good sorting"
          >
            <ThumbsUp size={14} fill={log.feedback === 'positive' ? "currentColor" : "none"} />
          </button>
          <button 
            onClick={() => handleFeedback(false)}
            className={`p-1 rounded hover:bg-slate-700 transition-colors ${log.feedback === 'negative' ? 'text-red-400 opacity-100' : 'text-slate-500'}`}
            title="Bad sorting"
          >
            <ThumbsDown size={14} fill={log.feedback === 'negative' ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP ---

export default function App() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inboxStats, setInboxStats] = useState({ pending: 0, processedUnread: 0, totalUnread: 0 });
  
  // Stats
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [avgConfidence, setAvgConfidence] = useState(0);
  const [labelDistribution, setLabelDistribution] = useState([]);

  // Replace this with your actual Apps Script Deployment URL if you publish it as a Web App
  const TRIGGER_URL = "YOUR_APPS_SCRIPT_WEB_APP_URL"; 

  useEffect(() => {
    // 1. Logs Listener
    const q = query(collection(db, "email_logs"), orderBy("processedDate", "desc"), limit(50));
    const unsubscribeLogs = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(data);
      setLoading(false);
      
      setTotalProcessed(snapshot.size); 
      const confSum = data.reduce((acc, curr) => acc + (curr.aiResponse?.confidence || 0), 0);
      setAvgConfidence(data.length ? (confSum / data.length).toFixed(1) : 0);

      const labels = {};
      data.forEach(l => { labels[l.appliedLabel] = (labels[l.appliedLabel] || 0) + 1 });
      setLabelDistribution(Object.entries(labels).map(([name, count]) => ({ name, count })));
    });

    // 2. Stats Listener
    const unsubscribeStats = onSnapshot(doc(db, "email_stats", "current"), (doc) => {
      if (doc.exists()) {
        setInboxStats(doc.data());
      }
    });

    return () => {
      unsubscribeLogs();
      unsubscribeStats();
    };
  }, []);

  const handleFeedback = async (docId, isPositive) => {
    const feedbackValue = isPositive ? 'positive' : 'negative';
    const logRef = doc(db, "email_logs", docId);
    try {
      await updateDoc(logRef, { feedback: feedbackValue, feedbackDate: new Date() });
    } catch (err) {
      console.error("Error saving feedback:", err);
    }
  };

  const triggerCleanup = () => {
    // Since we can't easily call GAS from Client without CORS/Auth complexity in this basic setup,
    // we'll simulate the "request" visually or log it. 
    // In a full setup, you'd fetch(TRIGGER_URL).
    alert("To trigger the cleanup remotely, you must deploy your Apps Script as a Web App (Everyone access) and paste the URL in App.jsx. For now, please run it from the Google Sheet/Script editor.");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 p-6 font-sans">
      <header className="mb-8 flex justify-between items-center">
        <div>
           <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Gemini Command Center
          </h1>
          <p className="text-slate-400">Real-time email intelligence dashboard</p>
        </div>
        <div className="flex items-center gap-4">
            <button 
              onClick={triggerCleanup}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Play size={16} /> Run Cleanup
            </button>
            <div className="flex items-center gap-2">
               <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <span className="text-sm font-medium text-green-500">System Online</span>
            </div>
        </div>
      </header>

      {/* INBOX STATS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="bg-slate-800/50 border-slate-700">
           <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Inbox Pending</p>
                <h3 className="text-3xl font-bold text-white">{inboxStats.pending || 0}</h3>
                <p className="text-xs text-slate-500">Unread & Unprocessed</p>
              </div>
              <div className="bg-purple-500/20 p-3 rounded-lg text-purple-400">
                <RefreshCw size={24} />
              </div>
           </div>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
           <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Sorted (Unread)</p>
                <h3 className="text-3xl font-bold text-white">{inboxStats.processedUnread || 0}</h3>
                 <p className="text-xs text-slate-500">Waiting for you</p>
              </div>
               <div className="bg-blue-500/20 p-3 rounded-lg text-blue-400">
                <Mail size={24} />
              </div>
           </div>
        </Card>
         <Card className="bg-slate-800/50 border-slate-700">
           <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Total Unread</p>
                <h3 className="text-3xl font-bold text-white">{inboxStats.totalUnread || 0}</h3>
                 <p className="text-xs text-slate-500">Total backlog</p>
              </div>
               <div className="bg-slate-500/20 p-3 rounded-lg text-slate-400">
                <AlertCircle size={24} />
              </div>
           </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="Session Processed" 
          value={totalProcessed} 
          subtext="Last 50 emails" 
          icon={Activity} 
          trend="up"
        />
        <StatCard 
          title="Avg. Confidence" 
          value={avgConfidence} 
          subtext="Scale of 1-10" 
          icon={CheckCircle2} 
        />
        <StatCard 
          title="Action Items" 
          value={logs.filter(l => l.aiResponse?.actionRequired).length} 
          subtext="Requires attention" 
          icon={AlertCircle} 
          trend="down"
        />
         <StatCard 
          title="Avg Processing" 
          value="~1.2s" 
          subtext="Per email" 
          icon={Clock} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Feed */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="min-h-[500px]">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity size={18} className="text-blue-400"/> Live Feed
            </h2>
            <div className="space-y-1">
              {loading ? (
                <div className="text-center py-10 text-slate-500">Connecting to Neural Network...</div>
              ) : (
                logs.map(log => (
                  <FeedItem 
                    key={log.id} 
                    log={log} 
                    onFeedback={handleFeedback} 
                  />
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar Charts */}
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Tag size={18} className="text-purple-400"/> Label Distribution
            </h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={labelDistribution}>
                  <XAxis dataKey="name" hide />
                  <Tooltip 
                    contentStyle={{backgroundColor: '#1e293b', border: 'none'}}
                    itemStyle={{color: '#fff'}}
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                  />
                  <Bar dataKey="count" fill="#818cf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
             <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-green-400"/> Recent Activity
            </h2>
             {/* Placeholder for activity sparkline */}
             <div className="h-32 flex items-center justify-center text-slate-600 text-sm italic">
                Wait for more data points...
             </div>
          </Card>
        </div>

      </div>
    </div>
  );
}