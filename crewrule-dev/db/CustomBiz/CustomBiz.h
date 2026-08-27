#ifndef CUSTOM_BIZ_H
#define CUSTOM_BIZ_H
#include <string>
#include "../CrewDB.h"


int customBizLoadData(CrewDataContext* dbData);

std::string makePairingLabel(Pairing* pairing, CrewDataContext* dbData);

//long long calculatePairingRankCombination(Pairing* pairing, CrewDataContext* dbData);
void calculatePairingListRankCombination(vector<Pairing*>& pairingList, CrewDataContext* dbData);

void calculatePairingOptions(vector<Pairing*>& pairings, CrewDataContext* dbData);
void calculatePairingOptionByComposition(vector<Pairing*>& pairings, CrewDataContext* dbData);

void calculatePairingDutyTimes(Pairing* pairing, CrewDataContext* dbData);

void calculateRosterDP(ROSTER* roster, CrewDataContext* dbData);

void calculatePairingDutyTimes(Duty* duty, CrewDataContext* dbData);

#endif//CUSTOM_BIZ_H