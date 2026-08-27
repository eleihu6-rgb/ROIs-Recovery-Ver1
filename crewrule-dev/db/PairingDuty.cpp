#include <stdio.h>
#include <vector>

#include <time.h>
#include "Duty.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"

using namespace std;

Duty::DUTY_TYPE parseDutyType(string &typeStr);

void makeIndexDutyToPairing(vector<Pairing*> &pairingList, Duty ** dutyList, int dutyCount) {
	int dutyIndex = 0;
	int pairIndex = 0;

	bool found13956437 = false;
	bool match13956437 = false;

	for (pairIndex = 0; pairIndex < (int)pairingList.size(); pairIndex++) {
		Pairing* pair = pairingList[pairIndex];
		
		while (dutyIndex < dutyCount) {
			Duty * duty = dutyList[dutyIndex];

			if (duty->getPairingId() == 13956437) {
				found13956437 = true;
			}


			if (duty->getPairingId() < pair->getDbId()) {

			} else if (duty->getPairingId() == pair->getDbId()) {
				pair->appendDuty(duty);


				if (duty->getPairingId() == 13956437) {
					match13956437 = true;
				}

			} else {
				break;
			}
			dutyIndex++;
		}
	}
}

void   computeAndSetDutyRegion(Duty * duty, map<string, DBAirport*>& airportMap) {

}

Duty::DUTY_TYPE parseDutyType(string &typeStr) {	
		
	//	DUTY_PURE_OPR		= 0, //'O'
	//	DUTY_POS_OWN		= 1, //'P'
	//	DUTY_POS_OTR		= 2, //'p'
	//	DUTY_DHD_OWN		= 3, //'D'
	//	DUTY_DHD_OTR		= 4, //'d'
	//	DUTY_FLY			= 5, // 'F'include fly seg
	//	DUTY_BLANK_DAY		= 6, // 'L'pure blank day
	//	DUTY_PAIRING_REST	= 7, // 'R'rest time after pairing		
		
	if (0 == typeStr.compare("O")) {
		return Duty::DUTY_PURE_OPR;
	} 
	else if (0 == typeStr.compare("P")) {
		return Duty::DUTY_POS_OWN;
	} 
	else if (0 == typeStr.compare("p")) {
		return Duty::DUTY_POS_OTR;
	} 
	else if (0 == typeStr.compare("D")) {
		return Duty::DUTY_DHD_OWN;
	} 
	else if (0 == typeStr.compare("d")) {
		return Duty::DUTY_DHD_OTR;
	} 
	else if (0 == typeStr.compare("F")) {
		return Duty::DUTY_FLY;
	} 
	else if (0 == typeStr.compare("L")) {
		return Duty::DUTY_BLANK_DAY;
	} 
	else if (0 == typeStr.compare("R")) {
		return Duty::DUTY_PAIRING_REST;
	} 
	return Duty::MAX_DUTY_PLC_TYPES;
}
