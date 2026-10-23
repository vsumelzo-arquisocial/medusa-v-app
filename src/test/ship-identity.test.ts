import { describe,expect,it } from 'vitest';
import { FLEETS,fleetId,moduleName,hullRepairCost,protectedCredits,recruitmentSeconds,timeoutWinner } from '@/lib/ship-identity';
describe('naves raciales',()=>{
 it('T’au tiene 22 de casco, Imperium 30 y Orkos 40',()=>{expect(FLEETS.tau.hull).toBe(22);expect(FLEETS.imperium.hull).toBe(30);expect(FLEETS.orks.hull).toBe(40);});
 it('la facción elige la nave sin lealtad heredada',()=>{expect(fleetId(null,'tau-empire')).toBe('tau');expect(fleetId('humanity','death-guard')).toBe('chaos');expect(fleetId('aeldari','drukhari')).toBe('drukhari');});
 it('los módulos cambian por raza',()=>{expect(moduleName('puente','tau')).not.toBe(moduleName('puente','orks'));});
 it('reparar cuesta 5 créditos por punto',()=>expect(hullRepairCost(8)).toBe(40));
 it('cámara protege 10 por ciento por nivel hasta 30',()=>{expect(protectedCredits(1000,1)).toBe(100);expect(protectedCredits(1000,3)).toBe(300);expect(protectedCredits(1000,8)).toBe(300);});
 it('comunicaciones reduce 10 por ciento por nivel hasta 30',()=>{expect(recruitmentSeconds(100,0)).toBe(3600);expect(recruitmentSeconds(100,3)).toBe(2520);});
 it.each([[true,false,'atacante'],[false,true,'defensor'],[false,false,'defensor'],[true,true,null]])('silencio %s/%s => %s',(a,d,w)=>expect(timeoutWinner(a,d)).toBe(w));
});