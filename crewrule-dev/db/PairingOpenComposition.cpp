/**
说明：
1 实现pairing.openComposition初始化、按roster递减
2 实现pairing下各个segment.openComposition初始化、按roster递减
*/
#include <stdio.h>
#include <stdlib.h>
#include <vector>

#include <fstream>
#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"

using namespace std;

//重置pairing下各个segment.openComposition，以各segment.complements为准
void resetPairingSegmentsOpenComposition(Pairing * pairing);

//根据指定rank、value遍历pairing下各个segment并递减openComposition
void fillPairingSegmentsOpenComposition(Pairing * pairing, string &fillRank, int fillValue);


//根据pairing composition计算旗下各个segment fill_composition
void makePairingSegmentOpenComposition(vector<Pairing *> &pairingList) {
	multimap<long long, SharedPtr<FlightRankValue>> fltRankFillValueMap;

	//按 pairing.plan_composition统计 flt->fill_composition
	for (std::size_t i = 0; i < pairingList.size(); i++) {
		Pairing * p = pairingList[i];
		map<string, int>& comp = p->getComplements();
		for (map<string, int>::iterator it = comp.begin(); it != comp.end(); it++) {
			string rank = it->first;
			int value = it->second;
			for (Duty* d : p->getDutyVec()) {
				for (Segment * s : d->getSegments()) {
					if (s->getDBId() != 0) {
						SharedPtr<FlightRankValue> item(new FlightRankValue);
						item->fltId = s->getDBId();
						item->rank = rank;
						item->value = value;
						fltRankFillValueMap.insert(make_pair(s->getDBId(), item));
					}
				}
			}
		}
	}

	//根据统计 flt->fill_composition设置各个 segment.fill_composition 
	for (std::size_t i = 0; i < pairingList.size(); i++) {
		Pairing * p = pairingList[i];
		resetPairingSegmentsOpenComposition(p);
		for (Duty* d : p->getDutyVec()) {
			for (Segment * s : d->getSegments()) {
				long long fltId = s->getDBId();
				std::size_t count = fltRankFillValueMap.count(fltId);
				auto iter = fltRankFillValueMap.find(fltId);
				for (std::size_t k = 0; k < count; k++) {
					SharedPtr<FlightRankValue> rankValue = iter++->second;
					s->fillCompositionRank(rankValue->rank, rankValue->value);
				}
			}
		}
	}
}

//重置pairing下各个segment.openComposition，以各segment.complements为准
void resetPairingSegmentsOpenComposition(Pairing * pairing) {
	if (!pairing)
		return;
	for (std::size_t i = 0; i < pairing->getDutyVec().size(); i++) {
		Duty * duty = pairing->getDutyVec()[i];
		for (std::size_t j = 0; j < duty->getSegments().size(); j++) {
			Segment * seg = duty->getSegments()[j];
			seg->resetOpenComposition();
		}
	}
}

//根据指定rank、value遍历pairing下各个segment并递减openComposition
void fillPairingSegmentsOpenComposition(Pairing * pairing, string &fillRank, int fillValue) {
	if (!pairing)
		return;
	for (std::size_t i = 0; i < pairing->getDutyVec().size(); i++) {
		Duty * duty = pairing->getDutyVec()[i];
		for (std::size_t j = 0; j < duty->getSegments().size(); j++) {
			Segment * seg = duty->getSegments()[j];
			auto &openComp = seg->getOpenComposition();
			auto it = openComp.find(fillRank);
			if (it != openComp.end()) {
				seg->fillCompositionRank(fillRank, fillValue);
			}
		}
	}
}