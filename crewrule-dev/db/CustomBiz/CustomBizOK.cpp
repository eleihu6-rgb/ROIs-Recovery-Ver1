#include <iostream>
#include <string>
#include <sstream>
#include "../Pairing.h"
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "CustomBizInternal.h"

using namespace std;

string makePairingLabel_OK(Pairing* pairing, map<string, DBAirport*>& airportCodeMap) {
	stringstream ss;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		if (i >= 1) {
			Duty* lastDuty = pairing->getDuty(i - 1);
			Duty* currentDuty = pairing->getDuty(i);
			time_t lastStartDt = getStartTimeOfDay(lastDuty->getStartTimeLocAct());
			time_t currentStartDt = getStartTimeOfDay(currentDuty->getStartTimeLocAct());
			if (currentStartDt - lastStartDt >= 2 * 24 * 3600)
				ss << "--/--";
			else
				ss << "--";
		}
		Duty * d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* s = d->getSegment(j);
			if (j == 0) {
				string depAbbr = airportCodeMap[s->getDepStation()]->airportABBR;
                if (depAbbr.empty()) {
                    depAbbr = airportCodeMap[s->getDepStation()]->airport;
                }
				ss << depAbbr;
			}
			string arvAbbr = airportCodeMap[s->getArrStation()]->airportABBR;
            if (arvAbbr.empty()) {
                arvAbbr = airportCodeMap[s->getArrStation()]->airport;
            }
			ss << "/" << arvAbbr;
		}
	}
	return ss.str();
}
