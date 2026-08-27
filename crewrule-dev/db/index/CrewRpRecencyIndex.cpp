#include "CrewRpRecencyIndex.h"

#include <stdio.h>
#include <vector>
#include <algorithm>

#include <limits.h>

#include <iostream>
#include <time.h>
#include "UtilFunc.h"
#include "Log/Logger.h"



CrewRpRecencyIndex::CrewRpRecencyIndex(const CrewDataContext* dbData) : _dbData(dbData) {
	makeIndex(dbData);
}

int CrewRpRecencyIndex::getHistoryCrewBlhOnFleet(const string& crewId, const string& fleet) const {
	int blh = 0;
	auto iterCrew = _crewBlhOnFleetMap.find(crewId);
	if (iterCrew == _crewBlhOnFleetMap.end()) {
		return 0;
	}
	auto iterFleet = iterCrew->second.find(fleet);
	if (iterFleet == iterCrew->second.end()) {
		return 0;
	}
	blh = iterFleet->second;
	return blh;
}

int CrewRpRecencyIndex::getCrewBlhOnFleet(const string& crewId, const string& fleet, const time_t deadlineUtc) const {
	int histroyBlh = getHistoryCrewBlhOnFleet(crewId, fleet);
	int senarioBlh = getCrewBlhOnFleetInSenario(crewId, fleet, deadlineUtc);
	return histroyBlh + senarioBlh;
}

//获取crew_rp_recency表中已统计机组人员该机型组的历史飞时合计(分钟)
int CrewRpRecencyIndex::getHistoryCrewBlhOnFleetGroup(const string& crewId, const string& fleetGroup) const {
	int blh = 0;
	auto iterCrew = _crewBlhOnFleetGroupMap.find(crewId);
	if (iterCrew == _crewBlhOnFleetGroupMap.end()) {
		return 0;
	}
	auto iterFleet = iterCrew->second.find(fleetGroup);
	if (iterFleet == iterCrew->second.end()) {
		return 0;
	}
	blh = iterFleet->second;
	return blh;
}

//获得机组人员在截止时间(deadline)之前在该机型组飞时合计(分钟)，包括历史飞时和场景内飞时
int CrewRpRecencyIndex::getCrewBlhOnFleetGroup(const string& crewId, const string& fleetGroup, const time_t deadlineUtc) const {
	int histroyBlh = getHistoryCrewBlhOnFleetGroup(crewId, fleetGroup);
	int senarioBlh = getCrewBlhOnFleetGroupInSenario(crewId, fleetGroup, deadlineUtc);
	return histroyBlh + senarioBlh;
}

void CrewRpRecencyIndex::makeIndex(const CrewDataContext* dbData) {
	//来自crewRpRecencyList，构建_crewBlhOnFleetMap、_crewBlhOnFleetGroupMap
	_crewBlhOnFleetMap.clear();
	_crewBlhOnFleetGroupMap.clear();
	for (auto& crewRpRecency : dbData->crewRpRecencyList) {
		if (crewRpRecency->types != "FLEET") {
			continue;
		}

		//构建_crewBlhOnFleetMap
		auto iterCrew = _crewBlhOnFleetMap.find(crewRpRecency->idCrew);
		if (iterCrew == _crewBlhOnFleetMap.end()) {
			map<string, int> fleetMap;//<fleet, blh>
			fleetMap.insert(std::make_pair(crewRpRecency->fleet, crewRpRecency->blkMin));
			_crewBlhOnFleetMap.insert(std::make_pair(crewRpRecency->idCrew, fleetMap));
		}
		else {
			auto iterFleet = iterCrew->second.find(crewRpRecency->fleet);
			if (iterFleet == iterCrew->second.end()) {
				iterCrew->second.insert(std::make_pair(crewRpRecency->fleet, crewRpRecency->blkMin));
			}
			else {
				iterCrew->second[crewRpRecency->fleet] += crewRpRecency->blkMin;
			}
		}

		//构建_crewBlhOnFleetGroupMap
		iterCrew = _crewBlhOnFleetGroupMap.find(crewRpRecency->idCrew);
		if (iterCrew == _crewBlhOnFleetGroupMap.end()) {
			map<string, int> fleetGroupMap;//<fleetGroup, blh>
			fleetGroupMap.insert(std::make_pair(crewRpRecency->fleetGroup, crewRpRecency->blkMin));
			_crewBlhOnFleetGroupMap.insert(std::make_pair(crewRpRecency->idCrew, fleetGroupMap));
		}
		else {
			auto iterFleet = iterCrew->second.find(crewRpRecency->fleetGroup);
			if (iterFleet == iterCrew->second.end()) {
				iterCrew->second.insert(std::make_pair(crewRpRecency->fleetGroup, crewRpRecency->blkMin));
			}
			else {
				iterCrew->second[crewRpRecency->fleetGroup] += crewRpRecency->blkMin;
			}
		}
	}
}

int CrewRpRecencyIndex::getCrewBlhOnFleetInSenario(const string& crewId, const string& fleet, const time_t deadlineUtc) const {
	int blh = 0;
	std::vector<shared_ptr<RosterFlight>> rfs = const_cast<CrewDataContext*>(_dbData)->rosterFlightMgr.get(crewId);
	if (rfs.empty()) {
		return 0;
	}
	time_t startTimeUtc = _dbData->scenario.startDtUTC;
	time_t endTimeUtc = deadlineUtc;
	for (auto& rf : rfs) {
		auto iterPairing = _dbData->pairingIdMap.find(rf->pairingId);
		if (iterPairing == _dbData->pairingIdMap.end()) {
			continue;
		}
		auto& pairing = iterPairing->second;
		for (const auto& segment : pairing->getSegmentsRead()) {
			if (!segment->getIsOperating()) {
				continue;
			}
			if (segment->getDBId() == rf->fltId 
				&& (segment->getStartTimeUtcAct()>=startTimeUtc && segment->getEndTimeUtcAct()< endTimeUtc)) {
				if (segment->getFleetCD() == fleet) {
					blh += segment->getBlkMinutes();
				}
			}
		}
	}
	return blh;
}

int CrewRpRecencyIndex::getCrewBlhOnFleetGroupInSenario(const string& crewId, const string& fleetGroup, const time_t deadlineUtc) const {
	int blh = 0;
	std::vector<shared_ptr<RosterFlight>> rfs = const_cast<CrewDataContext*>(_dbData)->rosterFlightMgr.get(crewId);
	if (rfs.empty()) {
		return 0;
	}
	time_t startTimeUtc = _dbData->scenario.startDtUTC;
	time_t endTimeUtc = deadlineUtc;
	for (auto& rf : rfs) {
		auto iterPairing = _dbData->pairingIdMap.find(rf->pairingId);
		if (iterPairing == _dbData->pairingIdMap.end()) {
			continue;
		}
		if (!matchAssignment(rf->assignment)) {
			continue;
		}
		auto& pairing = iterPairing->second;
		for (const auto& segment : pairing->getSegmentsRead()) {
			if (segment->getDBId() == rf->fltId
				&& (segment->getStartTimeUtcAct() >= startTimeUtc && segment->getEndTimeUtcAct() < endTimeUtc)) {
				auto iterFleet = _dbData->fleetMap.find(segment->getFleetCD());
				if (iterFleet == _dbData->fleetMap.end()) {
					continue;
				}

				if (iterFleet->second.fleetGrp  == fleetGroup) {
					blh += segment->getBlkMinutes();
				}
			}
		}
	}
	return blh;
}

bool CrewRpRecencyIndex::matchAssignment(const string& assignment) const {
	return assignment == "FLY" || assignment == "OPR";
}