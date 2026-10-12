import React, { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { ProgressBar } from './ui/ProgressBar';
import { formatBytes, formatNumber } from '../lib/utils';

export function TrafficAnalyticsView({ trafficData }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerLayerRef = useRef(null);
  const leafletRef = useRef(null);
  const [mapReady,setMapReady] = useState(false);

  const summary = trafficData?.summary || {};
  const domains = summary.domains || {};
  const statusCodes = trafficData?.status_codes || {};
  const topEndpoints = trafficData?.top_endpoints || [];
  const topIps = trafficData?.top_ips || [];
  const osStats = trafficData?.os_stats || {};
  const locations = trafficData?.locations || [];
  const recent = trafficData?.recent_visitors || [];

  // Load mapping code only on this view and dispose the map on navigation.
  useEffect(() => {
    if (!trafficData?.retention?.geoipEnabled) return;
    let disposed=false, timer;
    Promise.all([import('leaflet'),import('leaflet/dist/leaflet.css')]).then(([module]) => {
      if (disposed || !mapContainerRef.current) return;
      const L=module.default;leafletRef.current=L;
      const map=L.map(mapContainerRef.current).setView([20,0],2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap',maxZoom:18,className:'cyber-map-tiles'}).addTo(map);
      markerLayerRef.current=L.layerGroup().addTo(map);mapInstanceRef.current=map;setMapReady(true);
      timer=setTimeout(()=>map.invalidateSize(),150);
    }).catch(()=>{});
    return () => {disposed=true;clearTimeout(timer);mapInstanceRef.current?.remove();mapInstanceRef.current=null;markerLayerRef.current=null;};
  },[trafficData?.retention?.geoipEnabled]);
  useEffect(() => {
    if (!mapReady || !markerLayerRef.current) return;
    markerLayerRef.current.clearLayers();
    for (const loc of locations) if (Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
      const marker=leafletRef.current.circleMarker([loc.lat,loc.lon],{radius:6,fillColor:'#4268da',color:'#fff',weight:1,fillOpacity:.7});
      const popup=document.createElement('div');popup.textContent=(loc.city || 'Unknown')+', '+(loc.country || 'Unknown')+' · '+loc.host+' · Devices: '+(loc.devices || 1);
      marker.bindPopup(popup);markerLayerRef.current.addLayer(marker);
    }
  },[locations,mapReady]);

  const domainKeys = Object.keys(domains);

  return (
    <div className="space-y-6">
      {trafficData?.retention && <p className="text-sm text-[var(--text-secondary)]">
        Window since {new Date(trafficData.retention.windowStartedAt).toLocaleTimeString()} (resets hourly).
        {' '}GeoIP {trafficData.retention.geoipEnabled ? 'enabled' : 'off'}; device enrichment {trafficData.retention.userAgentEnabled ? 'enabled' : 'off'}.
        {' '}Dropped lines: {trafficData.processing?.droppedLines || 0}; skipped bytes: {trafficData.processing?.droppedBytes || 0}.
        {trafficData.retention.uniqueCountsAreLowerBounds && ' Unique counts reached their cap and are lower bounds.'}
      </p>}
      {/* ─── Top Domain Metrics Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {domainKeys.map((key, idx) => {
          const dom = domains[key] || {};
          const mobileCount = dom.mobile_hits || 0;
          const webCount = dom.web_hits || 0;
          const totalHits = dom.hits || (mobileCount + webCount) || 0;
          const mobPct = totalHits > 0 ? Math.round((mobileCount / totalHits) * 100) : 0;
          const deskPct = 100 - mobPct;

          return (
            <Card key={key} className="space-y-2">
              <CardHeader className="py-2.5">
                <CardTitle className="truncate">{dom.name || key}</CardTitle>
                <Badge variant={idx === 0 ? 'ok' : idx === 1 ? 'blue' : 'neutral'}>
                  SITE {idx + 1}
                </Badge>
              </CardHeader>
              <CardContent className="p-4 space-y-3 font-mono text-xs">
                <div className="text-[var(--text-secondary)] truncate text-xs font-semibold">{key}</div>
                <div className="flex justify-between items-baseline">
                  <div>
                    <div className="text-xl font-bold text-[var(--text-primary)]">
                      {formatNumber(dom.hits || 0)}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">TOTAL HITS</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-[var(--success)]">
                      {formatNumber(dom.unique || 0)}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">UNIQUE DEVICES</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-color)] space-y-1.5">
                  <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
                    <span>MOBILE: {mobPct}%</span>
                    <span>DESKTOP: {deskPct}%</span>
                  </div>
                  <ProgressBar value={mobPct} variant="green" />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Global Aggregate Card */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Total Aggregated</CardTitle>
            <Badge variant="warn">ALL SITES</Badge>
          </CardHeader>
          <CardContent className="p-4 space-y-3 font-mono text-xs">
            <div className="text-[var(--text-secondary)] text-xs font-semibold">Deduplicated Telemetry</div>
            <div className="flex justify-between items-baseline">
              <div>
                <div className="text-xl font-bold text-[var(--text-primary)]">
                  {formatNumber(summary.total_hits || 0)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">RAW HITS</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-[var(--warning)]">
                  {formatNumber(summary.unique_devices || 0)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">DEVICES</div>
              </div>
            </div>
            <div className="pt-2 border-t border-[var(--border-color)] flex justify-between text-xs text-[var(--text-secondary)]">
              <span>BANDWIDTH: <strong className="text-[var(--text-secondary)]">{formatBytes(summary.total_bytes || 0)}</strong></span>
              <span>MOBILE: {summary.total_mobile_hits || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Map & Active Sessions ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Leaflet Geo Map (7 cols) */}
        <Card className="lg:col-span-7 flex flex-col">
          <CardHeader>
            <CardTitle>Geographic Visitor Map</CardTitle>
            <Badge variant="ok">{locations.length} ACTIVE LOCATIONS</Badge>
          </CardHeader>
          <div className="flex-1 min-h-[360px] bg-[var(--bg-main)]">
            {trafficData?.retention?.geoipEnabled ? <div ref={mapContainerRef} className="w-full h-[360px]" /> : <div className="empty-state">Geolocation is disabled. Traffic totals are available without loading map data.</div>}
          </div>
        </Card>

        {/* Recent Visitors Table (5 cols) */}
        <Card className="lg:col-span-5 flex flex-col">
          <CardHeader>
            <CardTitle>Recent Visitor Sessions</CardTitle>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">LIVE FEED</span>
          </CardHeader>
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 border-b border-[var(--border-color)] bg-[var(--card-bg)] text-[10px] uppercase text-[var(--text-muted)] theme-header">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Host</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)] font-sans">
                      No recent visitors recorded in access log.
                    </td>
                  </tr>
                ) : (
                  recent.map((r, idx) => (
                    <tr key={idx} className="hover:bg-[var(--card-bg)]">
                      <td className="px-3 py-2 text-[var(--text-muted)] text-xs whitespace-nowrap">{r.timestamp || '--'}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)] font-medium">{r.host}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                        {r.city && r.city !== 'Unknown' ? `${r.city}, ${r.country}` : r.country || 'Unknown'}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-muted)] text-xs truncate max-w-[120px]">
                        {r.os} ({r.device})
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ─── HTTP Status Codes & Top Endpoints ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Status Codes */}
        <Card>
          <CardHeader>
            <CardTitle>HTTP Status Codes</CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-2 gap-2 text-center font-mono">
            <div className="rounded border border-[var(--border-color)] bg-[var(--card-bg)] p-2.5 theme-header">
              <Badge variant="ok">2xx OK</Badge>
              <div className="text-xl font-bold mt-1 text-[var(--text-primary)]">
                {formatNumber(statusCodes['2xx'] || 0)}
              </div>
            </div>
            <div className="rounded border border-[var(--border-color)] bg-[var(--card-bg)] p-2.5 theme-header">
              <Badge variant="blue">3xx REDIR</Badge>
              <div className="text-xl font-bold mt-1 text-[var(--text-primary)]">
                {formatNumber(statusCodes['3xx'] || 0)}
              </div>
            </div>
            <div className="rounded border border-[var(--border-color)] bg-[var(--card-bg)] p-2.5 theme-header">
              <Badge variant="warn">4xx CLIENT</Badge>
              <div className="text-xl font-bold mt-1 text-[var(--text-primary)]">
                {formatNumber(statusCodes['4xx'] || 0)}
              </div>
            </div>
            <div className="rounded border border-[var(--border-color)] bg-[var(--card-bg)] p-2.5 theme-header">
              <Badge variant="err">5xx SERVER</Badge>
              <div className="text-xl font-bold mt-1 text-[var(--text-primary)]">
                {formatNumber(statusCodes['5xx'] || 0)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Endpoints */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Requested Endpoints</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto max-h-[220px] overflow-y-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 border-b border-[var(--border-color)] bg-[var(--card-bg)] text-[10px] uppercase text-[var(--text-muted)] theme-header">
                <tr>
                  <th className="px-4 py-2">Host</th>
                  <th className="px-4 py-2">Endpoint Path</th>
                  <th className="px-4 py-2 text-right">Hits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {topEndpoints.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-[var(--text-muted)] font-sans">
                      No endpoint data recorded.
                    </td>
                  </tr>
                ) : (
                  topEndpoints.map((ep, idx) => (
                    <tr key={idx} className="hover:bg-[var(--card-bg)]">
                      <td className="px-4 py-2 font-medium text-[var(--text-secondary)]">{ep.host}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)] truncate max-w-sm">{ep.path}</td>
                      <td className="px-4 py-2 text-right font-bold text-[var(--text-primary)]">
                        {formatNumber(ep.hits)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ─── Top Visitor IPs & Operating Systems ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top IPs */}
        <Card>
          <CardHeader>
            <CardTitle>Top Visitor IP Addresses</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto max-h-[220px] overflow-y-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 border-b border-[var(--border-color)] bg-[var(--card-bg)] text-[10px] uppercase text-[var(--text-muted)] theme-header">
                <tr>
                  <th className="px-4 py-2">IP Address</th>
                  <th className="px-4 py-2">Location</th>
                  <th className="px-4 py-2 text-right">Hits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {topIps.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-[var(--text-muted)] font-sans">
                      No IP data available.
                    </td>
                  </tr>
                ) : (
                  topIps.map((ip, idx) => (
                    <tr key={idx} className="hover:bg-[var(--card-bg)]">
                      <td className="px-4 py-2 font-medium text-[var(--text-secondary)]">{ip.ip}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">
                        {ip.city && ip.city !== 'Unknown' ? `${ip.city}, ${ip.country}` : ip.country || 'Unknown'}
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-[var(--text-primary)]">
                        {formatNumber(ip.hits)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Operating Systems */}
        <Card>
          <CardHeader>
            <CardTitle>Operating System Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
            {Object.keys(osStats).length === 0 ? (
              <div className="col-span-full text-center text-[var(--text-muted)] font-sans py-4">
                No OS statistics recorded.
              </div>
            ) : (
              Object.entries(osStats).map(([os, count]) => (
                <div
                  key={os}
                  className="rounded border border-[var(--border-color)] bg-[var(--card-bg)] p-3 space-y-1 theme-header"
                >
                  <div className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">{os}</div>
                  <div className="text-lg font-bold text-[var(--text-primary)]">
                    {formatNumber(count)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
