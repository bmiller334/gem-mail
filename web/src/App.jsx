import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { Mail, AlertCircle, CheckCircle2, TrendingUp, Activity, Users, ThumbsUp, ThumbsDown, RefreshCw, Play, Zap } from 'lucide-react';

// --- COMPONENTS ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 rounded-lg p-4 shadow-[0_0_15px_rgba(34,211,238,0.1)] ${className}`}>
    {children}
  </div>
);

const StatCard = ({ title, value, subtext, icon: Icon }) => (
  <Card className="group hover:border-fuchsia-500/50 transition-all duration-300">
    <div className="flex justify-between items-start">
      <div>
        <h3 className="text-cyan-400 text-sm font-bold tracking-wider mb-1 uppercase drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">{title}</h3>
        <div className="text-3xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{value}</div>
        {subtext && <div className="text-xs text-fuchsia-300 mt-1 font-mono">{subtext}</div>}
      </div>
      <div className={`p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-white/10`}>
        <Icon size={24} />
      </div>
    </div>
  </Card>
);

const FeedItem = ({ log, onFeedback }) => {
  const urgencyColor = {
    'High': 'text-fuchsia-500 border-fuchsia-500/50 bg-fuchsia-500/10 shadow-[0_0_10px_rgba(217,70,239,0.2)]',
    'Medium': 'text-cyan-400 border-cyan-400/50 bg-cyan-400/10',
    'Low': 'text-slate-400 border-slate-500/50 bg-slate-500/10'
  };

  const handleFeedback = (isPositive) => {
    onFeedback(log.id, isPositive);
  };

  return (
    <div className="border-b border-white/10 py-3 px-3 hover:bg-white/5 transition-all duration-200 group relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-1000 pointer-events-none"></div>

      <div className="flex justify-between items-start mb-1 relative z-10">
        <span className="font-bold text-white truncate pr-2 font-mono">{log.sender}</span>
        <span className="text-xs text-cyan-300/70 whitespace-nowrap font-mono">
          {log.processedDate?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </span>
      </div>
      <div className="text-sm text-slate-300 mb-2 truncate relative z-10">{log.subject}</div>
      <div className="flex justify-between items-center relative z-10">
        <div className="flex gap-2 items-center text-xs">
          <span className={`px-2 py-0.5 rounded border ${urgencyColor[log.aiResponse?.urgency] || urgencyColor['Low']} uppercase font-bold text-[10px]`}>
            {log.aiResponse?.urgency || 'Low'}
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 font-mono">
            {log.appliedLabel}
          </span>
        </div>
        
        <div className="flex gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => handleFeedback(true)}
            className={`p-1 rounded hover:bg-cyan-500/20 transition-colors ${log.feedback === 'positive' ? 'text-cyan-400' : 'text-slate-500'}`}
          >
            <ThumbsUp size={14} fill={log.feedback === 'positive' ? "currentColor" : "none"} />
          </button>
          <button 
            onClick={() => handleFeedback(false)}
            className={`p-1 rounded hover:bg-fuchsia-500/20 transition-colors ${log.feedback === 'negative' ? 'text-fuchsia-400' : 'text-slate-500'}`}
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
  const [inboxStats, setInboxStats] = useState({ pending: 0, processedUnread: 0, totalUnread: 0, status: 'IDLE', lastUpdated: null });
  
  // Stats
  const [avgConfidence, setAvgConfidence] = useState(0);
  const [topSenders, setTopSenders] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "email_logs"), orderBy("processedDate", "desc"), limit(50));
    const unsubscribeLogs = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(data);
      setLoading(false);
      
      const confSum = data.reduce((acc, curr) => acc + (curr.aiResponse?.confidence || 0), 0);
      setAvgConfidence(data.length ? (confSum / data.length).toFixed(1) : 0);

      // Calculate Top Senders
      const senders = {};
      data.forEach(l => {
        const senderName = (l.sender || '').split('<')[0].trim().replace(/"/g, '') || 'Unknown';
        senders[senderName] = (senders[senderName] || 0) + 1;
      });

      const sortedSenders = Object.entries(senders)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Get top 5

      setTopSenders(sortedSenders);
    });

    const unsubscribeStats = onSnapshot(doc(db, "email_stats", "current"), (doc) => {
      if (doc.exists()) {
        const d = doc.data();
        if (d.lastUpdated?.toDate) d.lastUpdated = d.lastUpdated.toDate();
        setInboxStats(d);
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
    alert("This feature is not yet implemented. Please trigger the script from Google Apps Script directly.");
  };

  return (
    <div className="min-h-screen bg-[#0b0c2a] text-slate-50 font-sans selection:bg-fuchsia-500 selection:text-white overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-20" style={{
        backgroundImage: `linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }}></div>

      <div className="relative p-6 max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-center border-b border-cyan-500/30 pb-6">
          <div className="mb-4 md:mb-0 text-center md:text-left">
             <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-yellow-300 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
              GEM-MAIL
            </h1>
            <p className="text-cyan-300/80 font-mono text-xs tracking-[0.2em] mt-2 uppercase">Smart Email Organizer</p>
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-2">
              <div className="flex items-center gap-4">
                  <button 
                    onClick={triggerCleanup}
                    className="flex items-center gap-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white px-6 py-2 rounded-lg border border-fuchsia-400 shadow-[0_0_15px_rgba(217,70,239,0.4)] transition-all active:scale-95"
                  >
                    <Play size={16} /> INITIALIZE
                  </button>
                  
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${inboxStats.status === 'RUNNING' ? 'border-green-500/50 bg-green-900/20' : 'border-slate-700 bg-slate-800/50'}`}>
                     <div className="relative flex h-3 w-3">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${inboxStats.status === 'RUNNING' ? 'bg-green-400' : 'bg-cyan-500'}`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${inboxStats.status === 'RUNNING' ? 'bg-green-500' : 'bg-cyan-500'}`}></span>
                      </div>
                      <span className={`text-sm font-mono font-bold ${inboxStats.status === 'RUNNING' ? 'text-green-400' : 'text-cyan-500'}`}>
                        {inboxStats.status === 'RUNNING' ? 'PROCESSING' : 'ONLINE'}
                      </span>
                  </div>
              </div>
              
              {inboxStats.lastUpdated && (
                <p className="text-[10px] text-slate-500 font-mono">
                  LAST CYCLE: {inboxStats.lastUpdated.toLocaleTimeString()}
                </p>
              )}
          </div>
        </header>

        {/* INBOX STATS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="INBOX PENDING" value={inboxStats.pending || 0} icon={RefreshCw} />
          <StatCard title="SORTED (UNREAD)" value={inboxStats.processedUnread || 0} icon={Mail} />
          <StatCard title="TOTAL UNREAD" value={inboxStats.totalUnread || 0} icon={AlertCircle} />
        </div>

        {/* MAIN LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2">
            <Card className="h-full min-h-[600px] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2 text-white italic">
                  <Activity size={20} className="text-fuchsia-400"/> DATA STREAM
                </h2>
                <div className="text-xs font-mono text-cyan-500 border border-cyan-500/30 px-2 py-1 rounded bg-cyan-900/20">
                  LIVE FEED (LAST 50)
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar" style={{maxHeight: '600px'}}>
                {loading ? (
                  <div className="text-center py-20">
                     <div className="animate-spin mb-4 text-cyan-500 mx-auto w-8 h-8 border-4 border-t-transparent border-cyan-500 rounded-full"></div>
                     <p className="text-cyan-400 font-mono text-sm animate-pulse">ESTABLISHING UPLINK...</p>
                  </div>
                ) : (
                  logs.map(log => <FeedItem key={log.id} log={log} onFeedback={handleFeedback} />)
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
             <div className="grid grid-cols-2 gap-4">
                <StatCard title="AVG CONFIDENCE" value={`${avgConfidence}%`} icon={CheckCircle2} />
                <StatCard title="AVG LATENCY" value="1.2s" icon={Zap} />
             </div>

            <Card>
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-white italic">
                <Users size={18} className="text-yellow-400"/> TOP SENDERS
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topSenders} layout="vertical" margin={{left: 10, right: 30, top: 10, bottom: 10}}>
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={80} 
                      tick={{fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace'}} 
                      interval={0}
                      tickFormatter={(value) => value.length > 12 ? `${value.substring(0, 10)}...` : value}
                    />
                    <Tooltip 
                      cursor={{fill: 'rgba(255,255,255,0.05)'}}
                      contentStyle={{backgroundColor: '#0f172a', border: '1px solid #22d3ee', color: '#fff'}}
                      labelStyle={{ color: '#facc15' }}
                    />
                    <Bar dataKey="count" fill="rgba(217, 70, 239, 0.7)" radius={[0, 4, 4, 0]} barSize={20}>
                      <LabelList dataKey="count" position="right" style={{ fill: '#22d3ee', fontSize: 12, fontWeight: 'bold' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
               <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-white italic">
                <TrendingUp size={18} className="text-cyan-400"/> SYSTEM STATUS
              </h2>
               <div className="h-32 flex items-center justify-center text-cyan-600/50 text-xs font-mono border border-dashed border-cyan-800 rounded bg-black/20">
                  AWAITING MORE TELEMETRY
               </div>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
