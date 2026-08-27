#ifndef CUSTOM_BIZ_INTERNAL_H
#define CUSTOM_BIZ_INTERNAL_H

#include <string>
#include <map>
#include "../CrewDB.h"


int customBizLoadDataHO(CrewDataContext* dbData);
void customBizLoadDataCA(CrewDataContext* dbData);
void filterPairingForCACCDOM(CrewDataContext* dbData);

std::string makePairingLabel_OK(Pairing* pairing, std::map<std::string, DBAirport*>& airportCodeMap);


long long calculatePairingRankCombination_common(Pairing* pairing, CrewDataContext* dbData);
void calculatePairingRankCombination_common(vector<Pairing*>& pairingList, CrewDataContext* dbData); // for all pairings

void calculatePairingOptions_common(vector<Pairing*>& pairingList, CrewDataContext* dbData);
void calculatePairingOptionByComposition_common(vector<Pairing*>& pairingList, CrewDataContext* dbData);

void fixSplitPairingRankCombinationId(vector<Pairing*>& pairingList, CrewDataContext* dbData);

#endif//CUSTOM_BIZ_INTERNAL_H