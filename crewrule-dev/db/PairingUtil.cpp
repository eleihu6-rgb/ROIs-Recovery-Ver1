

#include "PairingUtil.h"
#include "PairingCompositionCalculator.h"
#include "csv/csv_impl.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"
#include "Log/Logger.h"
#include "RuleParams.h"

using namespace std;


//清理 pairing/duty/seg copy，与makePairingDutySegmentCopy对应
void clearPairingDutySegmentCopy(vector<Pairing*>& copies) {
	for (Pairing* p : copies) {
		for (Duty* d : p->getDutyVec()){
			for (Segment* s : d->getSegments()) {
				delete s;
			}
			delete d;
		}
		delete p;
	}
	copies.clear();
}

//创建 pairing/duty/seg copy，与clearPairingDutySegmentCopy对应
vector<Pairing*> makePairingDutySegmentCopy(vector<Pairing*>& source, Scenario& scenario, bool ignoreScenarioIdRefresh = false) {
	vector<Pairing*> pairingCopies;
	long long pairingId = -1;
	long long dutyId = -1;
	long long segmentId = -1;
	for (Pairing* p : source) {
		Pairing* copyP = new Pairing(*p);
		if (!ignoreScenarioIdRefresh)
			copyP->setScenarioId(scenario.scenarioId);
		copyP->setDbId(pairingId);
		vector<Duty*> dutyCopies;
		for (int i = 0; i < (int)p->getNumDuties(); i++) {
			Duty * d = p->getDuty(i);
			Duty * copyD = new Duty(*d);
			copyD->setPairingId(pairingId);
			copyD->setDutyId(dutyId);
			copyD->setDutySeq(i + 1);
			if (!ignoreScenarioIdRefresh)
				copyD->setScenarioId(scenario.scenarioId);//20200509 ain

			vector<Segment*> segCopies;
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				Segment* copyS = new Segment(*s);
				copyS->setPairingId(pairingId);
				copyS->setDutyId(dutyId);
				copyS->setSegmentId(segmentId);
				copyS->setDutySeq(i + 1);
				if (!ignoreScenarioIdRefresh)
					copyS->setScenarioId(scenario.scenarioId);//20200509 ain
				//next seg id
				segmentId--;
				segCopies.push_back(copyS);
			}
			copyD->setSegments(segCopies);
			dutyCopies.push_back(copyD);
			//next duty id
			dutyId--;
		}
		copyP->setDutyVec(dutyCopies);
		pairingCopies.push_back(copyP);
		//next id
		pairingId--;
	}
	return pairingCopies;
}

void resetPairingDutySegmentId(vector<Pairing*>& source, Scenario& scenario) {
	long long segmentId = -1;
	long long nodeId = -1;
	for (Pairing* p : source) {
		auto pairingId = p->getDbId();
		for (int i = 0; i < (int)p->getNumDuties(); i++) {
			Duty * d = p->getDuty(i);
			auto dutyId = d->getDutyId();
			d->setPairingId(pairingId);
			d->setDutySeq(i + 1);
			d->setScenarioId(p->getScenarioId());//20200509 ain
			auto segments = d->getSegments();
			for (auto &s : segments) {
				auto copyS = new Segment(*s);
				copyS->setPairingId(pairingId);
				copyS->setDutyId(dutyId);
				copyS->setSegmentId(segmentId--);
				copyS->setDutySeq(i + 1);
				copyS->setScenarioId(p->getScenarioId());//20200509 ain
				s = copyS;
			}
			d->setSegments(segments);
			for(auto &node:d->pairingDutyNodes){
				node->setPairingId(pairingId);
				node->setDutyId(dutyId);
				node->setId(nodeId--);
			}
		}
	}
}

void resetPairingDutyFdpDpBlk(vector<Pairing*>& list) {
	for (Pairing* p : list) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty * d = p->getDuty(i);
			int historyBlkMinutes = 0;
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment * s = d->getSegment(j);
				if (s->getBlkMinHistory() != 0)
					historyBlkMinutes += s->getBlkMinHistory();
				else
					historyBlkMinutes += static_cast<int>((s->getUtcEndTime() - s->getUtcStartTime()) / 60);
			}
			d->setFlyHoursHistory(historyBlkMinutes / 60.0);
			d->setActualBlockTime(d->getBLKInMins());
			d->setActualFDP(d->getFDPInSecs() / 60);
			d->setActualDP(d->getDPInSecs() / 60);
		}
	}
}
void resetPairingDutyNodes(vector<Pairing*>& list, CrewDataContext *dbData) {
	//modified by zzm, 重算PairingDutyNode
	for (auto p : list) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			d->pairingDutyNodes.clear();
		}
	}

	for (auto p:list){
		createPairingNodeOfDuty(p, dbData);
		createPairingNodeOfSeg(p, dbData);
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			std::sort(d->pairingDutyNodes.begin(), d->pairingDutyNodes.end(), [](const auto& n1, const auto& n2) {
				if (n1->getStartUtc() < n2->getStartUtc())
					return true;
				else if (n1->getStartUtc() > n2->getStartUtc())
					return false;
				else {
					int n1seq = 1;
					if (n1->getNode() == "PICKUP")
						n1seq = 1;
					else if (n1->getNode() == "BRIEF")
						n1seq = 2;
					else if (n1->getNode() == "DEBRIEF")
						n1seq = 3;
					else // DROPOFF
						n1seq = 4;

					int n2seq = 1;
					if (n2->getNode() == "PICKUP")
						n2seq = 1;
					else if (n2->getNode() == "BRIEF")
						n2seq = 2;
					else if (n2->getNode() == "DEBRIEF")
						n2seq = 3;
					else // DROPOFF
						n2seq = 4;

					return n1seq < n2seq;
				}
			});
			int index = 0;
			for (const auto &n : d->pairingDutyNodes)
				n->setSequence(++index);
		}
	}
}
//20190508 ain, mantis#5518, 除 savePO外, 其他流程不再需要根据 fdp/bh重算配比 rankValue
//根据pairing配比 rankValue计算对应 pairing
vector<void*> makePairingCompositions(CrewDataContext* dbData, vector<Pairing*>& list) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application != PAIRING_OPTIMIZER) {
		vector<void*> csvPairingCompositionList;
		for (auto& pairingComposition : dbData->pairingCompositionList) {
			csvPairingCompositionList.push_back(new csvActivityComposition(pairingComposition));
		}
		return csvPairingCompositionList;
	}

	PairingCompositionCalculator calculator(dbData->scenario.airline, dbData->scenario.division, dbData->ruleList, dbData->fleetList, dbData->compositionList, dbData->compositionRankMap, dbData->rankList, dbData->fltIdToAircraftMap, &(dbData->systemParamMap));

	map<long long, Composition*> compositionIdMap;
	for (auto& c : dbData->compositionList){
		compositionIdMap[c.getCompositionId()] = &c;
	}
	//计算 pairingComposition
	int pcIndex = -1;
	vector<void*> csvPairingCompositionList;
	for (Pairing* p : list) {
		if (dbData->version == 3) {
			map<std::string, int> compositionMap = p->getComplements();
			for (auto& it : compositionMap) {
				csvActivityComposition * item = new csvActivityComposition;
				item->activityId = p->getDbId();
				item->actingRank = it.first;
				item->planValue = it.second;
				item->id = pcIndex;
				item->scenarioId = p->getScenarioId();
				pcIndex--;
				if (dbData->rankMap.find(item->actingRank) == dbData->rankMap.end()) {
					Logger::getRuleLogger()->error("ERROR: invalid data, rank={} not found", item->actingRank.c_str());
				}
				string division = dbData->rankMap[item->actingRank].division;
				item->division = (division.length() == 0 ? 'P' : division.at(0));
				csvPairingCompositionList.push_back(item);
			}
		}
		else {
			map<long long, int> compMultiplerMap = calculator.computeCompIdAndMultiplierFromRankValue(p->getComplements());
			for (auto & it : compMultiplerMap) {
				csvActivityComposition * item = new csvActivityComposition;
				item->activityId = p->getDbId();
				item->compId = it.first;
				item->multipler = it.second;
				item->id = pcIndex;
				item->scenarioId = p->getScenarioId();
				pcIndex--;

				if (compositionIdMap.find(item->compId) == compositionIdMap.end()) {
					Logger::getRuleLogger()->error("ERROR: invalid data, composition={} not found", item->compId);
				}
				string division = compositionIdMap[item->compId]->getDivision();
				item->division = (division.length() == 0 ? 'P' : division.at(0));
				csvPairingCompositionList.push_back(item);
			}
		}
		
	}
	return csvPairingCompositionList;
}

// 20220622 PD flight composition
vector<void*> makeFlightCompositions(CrewDataContext* dbData, vector<Pairing*>& list) {

	PairingCompositionCalculator calculator(dbData->scenario.airline, dbData->scenario.division, dbData->ruleList, dbData->fleetList, dbData->compositionList, dbData->compositionRankMap, dbData->rankList, dbData->fltIdToAircraftMap, &(dbData->systemParamMap));

	map<long long, Composition*> compositionIdMap;
	for (auto& c : dbData->compositionList) {
		compositionIdMap[c.getCompositionId()] = &c;
	}
	//计算 pairingComposition
	int pcIndex = -1;
	vector<void*> csvFlightCompositionList;
	unordered_map<long long, map<string, int>> flightRankMap;

	for (Pairing* p : list) {
		auto rankmap = p->getComplements();
		for (Duty* d : p->getDutyVec()) {
			for (Segment* s : d->getSegments()) {
				if (s->getIsOperating() == false) // skip non flying segment
					continue;
				auto fit = flightRankMap.find(s->getDBId());
				if (fit == flightRankMap.end()) {
					auto ret = flightRankMap.insert({ s->getDBId(), map<string, int>() });
					if (ret.second)
						fit = ret.first;
					else
						continue;
				}
				auto& fltRank = fit->second;
				
				for (auto r : rankmap) {					
					if (fltRank.find(r.first) == fltRank.end()) 
						fltRank.insert(r);
					else
						fltRank[r.first] += r.second;
				}
			}
		}
	}
	for (auto fit: flightRankMap) {
		auto fid = fit.first;
		auto comp = fit.second;
		if (dbData->version == 3) {
			for (auto & it : comp) {
				csvActivityComposition * item = new csvActivityComposition;
				item->activityId = fid;
				item->actingRank = it.first;
				item->planValue = it.second;
				item->id = pcIndex;
				item->scenarioId = dbData->scenarioId;
				item->pairingScenarioId = dbData->scenario.idScenarioPair;
				pcIndex--;

				if (dbData->rankMap.find(item->actingRank) == dbData->rankMap.end()) {
					Logger::getRuleLogger()->error("ERROR: invalid data, rank={} not found", item->actingRank.c_str());
				}
				string division = dbData->rankMap[item->actingRank].division;
				item->division = (division.length() == 0 ? 'P' : division.at(0));
				csvFlightCompositionList.push_back(item);
			}
			
		}
		else {
			map<long long, int> compMultiplerMap = calculator.computeCompIdAndMultiplierFromRankValue(comp);
			for (auto & it : compMultiplerMap) {
				csvActivityComposition * item = new csvActivityComposition;
				item->activityId = fid;
				item->compId = it.first;
				item->multipler = it.second;
				item->id = pcIndex;
				item->scenarioId = dbData->scenarioId;
				item->pairingScenarioId = dbData->scenario.idScenarioPair;
				pcIndex--;

				if (compositionIdMap.find(item->compId) == compositionIdMap.end()) {
					Logger::getRuleLogger()->error("ERROR: invalid data, composition={} not found", item->compId);
				}
				string division = compositionIdMap[item->compId]->getDivision();
				item->division = (division.length() == 0 ? 'P' : division.at(0));
				csvFlightCompositionList.push_back(item);
			}
		}
		
	}
	return csvFlightCompositionList;
}

void resetPairingRegion(vector<Pairing*>& list) {
	map<int, string> levelToRegion;
	map<string, int> regionToLevel;
	levelToRegion[0] = "D"; levelToRegion[1] = "I"; levelToRegion[2] = "R";
	regionToLevel["D"] = 0; regionToLevel["I"] = 1; regionToLevel["R"] = 2;
	for (Pairing* p : list) {
		int pairingRegionLevel = 0; //0=D, 1=I, 2=R
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty * d = p->getDuty(i);
			int dutyRegionLevel = 0;
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				if (regionToLevel[s->getRegion()] > pairingRegionLevel)
					pairingRegionLevel = regionToLevel[s->getRegion()];
				if (regionToLevel[s->getRegion()] > dutyRegionLevel)
					dutyRegionLevel = regionToLevel[s->getRegion()];
			}
			d->setRegion(levelToRegion[dutyRegionLevel]);
		}
		p->setRegion(levelToRegion[pairingRegionLevel]);
	}
}

void resetPairingSegmentAssignment(vector<Pairing*>& list) {
	for (Pairing* p : list) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty * d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment * s = d->getSegment(j);
				if (s->getAssignment().empty()) {
					if (s->getIsOperating())
						s->setAssignment("FLY");
					else if (s->isDeadhead())
						s->setAssignment("DHD");
					else if (s->isBusFerry())
						s->setAssignment("BUS");
					else if (s->isTrainFerry())
						s->setAssignment("TRAIN");
				}
			}
		}
	}
}

void resetPairingDutyAirport(vector<Pairing*>& list) {
	for (Pairing* p : list) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty * d = p->getDuty(i);
			if (d->getType() == Duty::DUTY_PAIRING_REST) {
				string airport = p->getDuty(i - 1)->getArrStation();
				d->setDepStation(airport);
				d->setArrStation(airport);
			}
		}
	}
}

void calculateDutyLayoverNights(vector<Pairing*>& pgs, CrewDataContext* dbData) {
	if (!dbData) {
		return;
	}
	//
	//寻找默认基地, 若无定义则按 pgs中base分布最多者
	int sysBaseOffsetMinutes = 0;
	if ("" != dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"]) {
		sysBaseOffsetMinutes = dbData->getAirportOffsetMinutes(dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"]);
	}
	else {
		map<string, int> baseOfPgCount;
		for (auto& p : pgs) {
			baseOfPgCount[p->getBase()] ++;
		}
		int maxCount = -1;
		string maxCountBase = 0;
		for (auto& it : baseOfPgCount) {
			if (it.second > maxCount) {
				maxCountBase = it.first;
			}
		}
		if ("" != maxCountBase) {
			sysBaseOffsetMinutes = dbData->getAirportOffsetMinutes(maxCountBase);
		}
	}
	
	for (auto& p : pgs) {
		if (!p ) {
			continue;
		}
		//
		//遍历duty
		for (int i = 0; i < (int)p->getNumDuties() - 1; i++) {
			Duty* prev = p->getDuty(i);
			Duty* next = p->getDuty(i + 1);
			time_t prevDt = getStartTimeOfDay(prev->getStartTimeUtcAct() + sysBaseOffsetMinutes * 60);
			time_t nextDt = getStartTimeOfDay(next->getStartTimeUtcAct() + sysBaseOffsetMinutes * 60);
			int layoverNits = static_cast<int>(nextDt - prevDt) / (24 * 3600);
			prev->setNumLayoverNights(layoverNits);
		}
	}
}