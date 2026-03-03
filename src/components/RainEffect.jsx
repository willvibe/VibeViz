import React, { useRef, useEffect } from 'react';

const RainEffect = ({ isTopZ, rainState }) => {
    const canvasRef = useRef(null);
    const rainStateRef = useRef(rainState);

    useEffect(() => { rainStateRef.current = rainState; }, [rainState]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;

        const drops = Array.from({ length: 150 }).map(() => ({
            x: Math.random() * w, y: Math.random() * h,
            r: Math.random() * 1.5 + 1.0, speed: Math.random() * 0.2 + 0.1, 
            wiggleOffset: Math.random() * Math.PI * 2,
            wiggleSpeed: Math.random() * 0.01 + 0.005,
            baseSpeed: Math.random() * 0.2 + 0.1
        }));

        let intensity = 0; 
        let animationId;
        let isVisible = true;

        const handleVisibilityChange = () => { isVisible = document.visibilityState === 'visible'; };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const draw = () => {
            if (!isVisible) {
                animationId = requestAnimationFrame(draw);
                return;
            }

            const state = rainStateRef.current;
            const targetIntensity = state === 0 ? 0 : state === 1 ? 0.33 : state === 2 ? 0.66 : 1.0;
            
            if (intensity < targetIntensity) {
                intensity += 0.02; if (intensity > targetIntensity) intensity = targetIntensity;
            } else if (intensity > targetIntensity) {
                intensity -= (state === 0) ? 0.0033 : 0.02; if (intensity < targetIntensity) intensity = targetIntensity;
            }

            ctx.clearRect(0, 0, w, h);

            const lineIntensity = Math.max(0, (intensity - 0.4) / 0.6); 
            if (lineIntensity > 0) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + 0.15 * lineIntensity})`;
                ctx.lineWidth = 1 + lineIntensity * 0.5;
                ctx.beginPath();
                const lineCount = Math.floor(lineIntensity * 80); 
                for (let i = 0; i < lineCount; i++) {
                    let lineX = (Date.now() * (0.03 + 0.02 * lineIntensity) + i * 80) % w;
                    let lineY = (Date.now() * (0.6 + 0.4 * lineIntensity) + i * 150) % h;
                    ctx.moveTo(lineX, lineY);
                    ctx.lineTo(lineX - (1.5 + lineIntensity * 0.5), lineY + (10 + 10 * lineIntensity));
                }
                ctx.stroke();
            }

            const visibleDrops = 40 + Math.floor(intensity * 110); 
            for(let i=0; i<drops.length; i++) {
                if (i > visibleDrops) continue;
                let drop = drops[i];

                const sizeMult = 1.0 + intensity * 0.5; 
                const speedMult = 1.0 + intensity * 0.8;
                const currentSpeed = drop.speed * speedMult;
                const stretch = currentSpeed > 0.4 ? currentSpeed * (1 + intensity * 0.5) : 0;
                const currentR = drop.r * sizeMult;
                
                ctx.beginPath();
                ctx.ellipse(drop.x, drop.y, currentR, currentR + stretch, 0, 0, Math.PI * 2);
                
                const grad = ctx.createRadialGradient(
                    drop.x - currentR * 0.3, drop.y - currentR * 0.3 - stretch / 2, currentR * 0.1,
                    drop.x, drop.y, currentR + stretch
                );
                const alphaCenter = 0.8 + intensity * 0.1;
                const alphaMid = 0.2 + intensity * 0.1;
                grad.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alphaCenter)})`);
                grad.addColorStop(0.4, `rgba(255, 255, 255, ${Math.min(1, alphaMid)})`);
                grad.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
                
                ctx.fillStyle = grad;
                ctx.fill();

                drop.y += currentSpeed;
                drop.x += Math.sin(Date.now() * drop.wiggleSpeed + drop.wiggleOffset) * 0.2 * sizeMult;

                if (drop.y > h + 20) { drop.y = -20; drop.x = Math.random() * w; }
            }
            animationId = requestAnimationFrame(draw);
        };
        
        animationId = requestAnimationFrame(draw);
        const handleResize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
        window.addEventListener('resize', handleResize);
        
        return () => {
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            cancelAnimationFrame(animationId);
        };
    }, []);

    return (
        <canvas ref={canvasRef} className={`fixed inset-0 pointer-events-none ${isTopZ ? 'z-[10000] opacity-90' : 'z-[-1] opacity-60'}`} />
    );
};

export default RainEffect;