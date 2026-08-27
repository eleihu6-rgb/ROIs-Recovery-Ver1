#ifndef PAIRING_UTIL_H
#define PAIRING_UTIL_H
#include <vector>
#include <map>
#include "CrewDB.h"

void clearPairingDutySegmentCopy(vector<Pairing*>& copies);
vector<Pairing*> makePairingDutySegmentCopy(vector<Pairing*>& source, Scenario& scenario, bool ignoreScenarioIdRefresh);
void resetPairingDutySegmentId(vector<Pairing*>& source, Scenario& scenario);
void resetPairingDutyFdpDpBlk(vector<Pairing*>& list);
void resetPairingDutyFdpDpBlk(std::vector<Pairing*>& list);
void resetPairingDutyNodes(vector<Pairing*>& list, CrewDataContext *dbData);
void resetPairingRegion(std::vector<Pairing*>& list);
void resetPairingSegmentAssignment(std::vector<Pairing*>& list);
void resetPairingDutyAirport(std::vector<Pairing*>& list);
void calculateDutyLayoverNights(vector<Pairing*>& pgs, CrewDataContext* dbData);
//void calculatePairingCompositionRankValue(CrewDataContext* dbData, std::vector<Pairing*>& list);
vector<void*> makePairingCompositions(CrewDataContext* dbData, std::vector<Pairing*>& list);
vector<void*> makeFlightCompositions(CrewDataContext* dbData, std::vector<Pairing*>& list);
#endif//PAIRING_UTIL_H