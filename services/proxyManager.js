class ProxyManager {
    constructor() {
        // You can add your proxy list here or load from .env
        this.proxies = process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',') : [];
        this.currentIndex = 0;
    }

    getNextProxy() {
        if (this.proxies.length === 0) return null;
        
        const proxy = this.proxies[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        
        console.log(`[ProxyManager] Rotating to proxy: ${proxy}`);
        return proxy;
    }

    getProxyObject() {
        const proxyStr = this.getNextProxy();
        if (!proxyStr) return null;

        try {
            // Support formats: host:port, http://host:port, host:port:user:pass
            const parts = proxyStr.replace('http://', '').split(':');
            
            if (parts.length === 2) {
                return { server: `http://${parts[0]}:${parts[1]}` };
            } else if (parts.length === 4) {
                return {
                    server: `http://${parts[0]}:${parts[1]}`,
                    username: parts[2],
                    password: parts[3]
                };
            }
            return { server: proxyStr.startsWith('http') ? proxyStr : `http://${proxyStr}` };
        } catch (err) {
            console.error('[ProxyManager] Invalid proxy format:', proxyStr);
            return null;
        }
    }
}

module.exports = new ProxyManager();