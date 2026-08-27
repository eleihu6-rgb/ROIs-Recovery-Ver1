#include <stdio.h>
#include <sstream>
#include <iostream>
#include <fstream>
#include <vector>
#include <algorithm>
#include <unordered_map>
#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilDbg.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

using namespace std;

int setCrewOnCof(unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, vector<SharedPtr<CREW>>& crewList) {
	map<string, SharedPtr<CREW>> crewIdMap;
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>::iterator it;

	for (std::size_t i = 0; i < crewList.size(); i++) {
		SharedPtr<CREW> crew = crewList[i];
		crewIdMap[crew->idCrew] = crew;
	}
	for (it = crewOnFlt.begin(); it != crewOnFlt.end(); it++) {
		for (std::size_t i = 0; i < it->second.size(); i++) {
			SharedPtr<CrewOnFlight> item = it->second[i];
			if (crewIdMap.find(item->crewId) == crewIdMap.end()) {
				Logger::getRuleLogger()->error("ERROR: invalid cof data, crew={} not found", item->crewId.c_str());
			}
			item->crew = crewIdMap[item->crewId];
		}
	}
	return 0;
}

//汇总 crewOnFlt中所有crewid
int getCrewIdListFromCof(unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, vector<string>& result) {
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>::iterator it;
	map<string, string> crewIdWithoutDuplicate;
	for (it = crewOnFlt.begin(); it != crewOnFlt.end(); it++) {
		for (std::size_t i = 0; i < it->second.size(); i++) {
			SharedPtr<CrewOnFlight> item = it->second[i];
			if (crewIdWithoutDuplicate.find(item->crewId) == crewIdWithoutDuplicate.end()) {
				crewIdWithoutDuplicate[item->crewId] = item->crewId;
			}
		}
	}
	map<string, string>::iterator it2;
	for (it2 = crewIdWithoutDuplicate.begin(); it2 != crewIdWithoutDuplicate.end(); it2++) {
		result.push_back(it2->first);
	}
	return 0;
}



//------------------------- add/del crew on flight -------------------------------
int addCrewOnFlight(SharedPtr<CREW>& crew, long long pairing_id, long long flt_id, string& rank, string& assignment, string& role, string& subRole, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, int seqOrder) {
	if (flt_id == 0) {
		return 0;
	}
	//mantis#2234, cof不筛选 assignment
	//if (isCofFltAssignment(s->getAssignment())) {
	//若flt_id不存在则新建cof集合
	if (crewOnFlt.find(flt_id) == crewOnFlt.end()) {
		crewOnFlt[flt_id] = vector < SharedPtr<CrewOnFlight> >();
	}
	//检查是否重复
	//for (k = 0; k < crewOnFlt[flt_id].size(); k++) {
	//	if (crewOnFlt[flt_id][k]->crewId == roster->idcrew) {
	//		Logger::getRuleLogger()->info("duplicate CREW_ON_FLIGHT for flt_id=%llu  crew={}", flt_id, roster->idcrew.c_str());
	//		ret = DB_ERR_DATA;
	//		goto CLEANUP;
	//	}
	//}
	//添加
	SharedPtr<CrewOnFlight> item(new CrewOnFlight());
	item->crewId = crew->idCrew;
	item->pairingId = pairing_id; //20180904 ain, mantis#3958
	item->fltId = flt_id;
	item->assignment = assignment;
	item->actingRank = rank;
	item->crew = crew;
	item->role = role;      //20180503 ain, mantis#3173, addRoster()同步更新cof逻辑赋值 cof.role
	item->subRole = subRole;
	item->seqOrder = seqOrder; //20190527 ZZM 同步SeqOrder
	item->division = crew->division;

	crewOnFlt[item->fltId].push_back(item);
	return 0;
}

//在crewOnFlt中添加数据
//输入roster，针对其下pairing下各个seg添加COF
int addCrewOnFlight(SharedPtr<ROSTER>& roster, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, map<string, SharedPtr<CREW>>& crewIdMap) {
	int ret = 0;
	if (roster->pairId == 0 || roster->pairing == NULL) {
		goto CLEANUP;
	}

	for (std::size_t i = 0; i < roster->pairing->getNumDuties(); i++) {
		Duty * d = roster->pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment * s = d->getSegment(j);
			long long flt_id = s->getDBId();
			//20190225 ain, mantis#5015, COF skip flt_id=0
			if (flt_id == 0) {
				continue;
			}
			//if (s->getAssignment() != "FLY" && s->getAssignment() != "OPR") {
			//	continue;
			//}
			//检查crew是否存在
			if (crewIdMap.find(roster->idcrew) == crewIdMap.end()) {
				Logger::getRuleLogger()->error("crew item not found for '{}'", roster->idcrew.c_str());
				ret = DB_ERR_DATA;
				goto CLEANUP;
			}

			//For Linux
			std::string assignment = s->getAssignment();
			addCrewOnFlight(crewIdMap[roster->idcrew], roster->pairId, flt_id, roster->actingRank, assignment, roster->role, roster->subRole, crewOnFlt, roster->seqOrder);
		}
	}
	ret = 0;
CLEANUP:
	return ret;
}

//在crewOnFlt中移除数据
int removeCrewOnFlight(string& crewId, long long fltId, long long pairingId, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt) {
	int ret = 0;
	std::size_t i = 0, j = 0, k = 0, m = 0;
	DBG_HELP("removeCrewOnFlight");
	//20190225 ain, mantis#5015, COF skip flt_id=0
	if (fltId == 0) {
		return ret;
	}
	//20190314 ain, mantis#5064, 增加参数 pairingId，当 COF上存在多个相同crew项时只移除 pairingId匹配的一个，以实应 swap相同 flt后 undo情况
	//eg
	//如swap前
	//	crew = F02352 ptn = 2604833 flt = 1752250
	//	crew = E84152 ptn = 2604950 flt = 1752250
	//swap后
	//	crew = F02352 ptn = 2604950 flt = 1752250
	//	crew = E84152 ptn = 2604833 flt = 1752250
	//undo时，先执行 updateRoster(ptn = 2604833 crew = E84152->F02352)，导致出现如下Cof状态
	//	crew = F02352 ptn = 2604950 flt = 1752250
	//	crew = F02352 ptn = 2604833 flt = 1752250

	//mantis#2234, COF不进行 assignment筛选
	//if (isCofFltAssignment(s->getAssignment())) {
	for (k = 0; k < crewOnFlt[fltId].size(); k++) {
		if (crewOnFlt[fltId][k]->crewId == crewId && crewOnFlt[fltId][k]->pairingId == pairingId) {
			break;
		}
	}
	//删除第k个：将末尾元素替换到k位置，并移除末尾
	if (k < crewOnFlt[fltId].size()) {
		crewOnFlt[fltId][k] = crewOnFlt[fltId][crewOnFlt[fltId].size() - 1];
	}
	//cofOfFlt.pop_back();
	if (!crewOnFlt[fltId].empty()) {
		crewOnFlt[fltId].pop_back();
	}
	return 0;
}

//在crewOnFlt中移除数据
//输入roster，针对其下pairing下各个seg
int removeCrewOnFlight(SharedPtr<ROSTER>& roster, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt) {
	int ret = 0;
	std::size_t i = 0, j = 0, k = 0, m = 0;
	DBG_HELP("removeCrewOnFlight");
	;
	if (roster->pairId == 0 || roster->pairing == NULL) {
		goto CLEANUP;
	}

	for (i = 0; i < roster->pairing->getNumDuties(); i++) {
		Duty * d = roster->pairing->getDuty(i);
		for (j = 0; j < d->getNumSegments(); j++) {
			Segment * s = d->getSegment(j);
			long long flt_id = s->getDBId();
			//20190225 ain, mantis#5015, COF skip flt_id=0
			if (flt_id == 0) {
				continue;
			}
			//if (s->getAssignment() != "FLY" && s->getAssignment() != "OPR") {
			//	continue;
			//}
			removeCrewOnFlight(roster->idcrew, flt_id, roster->pairId, crewOnFlt);
		}
	}
	ret = 0;
CLEANUP:
	return ret;
}

int addCrewOnPairing(long long pairingId, SharedPtr<CREW> crew, SharedPtr<ROSTER>& roster,  map<long long, list<SharedPtr<CrewOnFlight>>>& crewOnPairing) {
	if (pairingId == 0)
		return SUCCESS;

	//检查是否已经存在
	bool alreadyExist = false;
	if (crewOnPairing.find(pairingId) != crewOnPairing.end()) {
		list<SharedPtr<CrewOnFlight>>& copList = crewOnPairing[pairingId];
		for (list<SharedPtr<CrewOnFlight>>::iterator it = copList.begin(); it != copList.end(); it++) {
			if ((*it)->crewId == roster->idcrew) {
				alreadyExist = true;
				break;
			}
		}
	}
	if (alreadyExist)
		return 20001;
	//检查pairingId是否已经存在
	if (crewOnPairing.find(pairingId) == crewOnPairing.end()) {
		crewOnPairing[pairingId] = list<SharedPtr<CrewOnFlight>>();
	}
	SharedPtr<CrewOnFlight> cop(new CrewOnFlight);
	cop->actingRank = roster->actingRank;
	cop->crew = crew;
	cop->crewId = roster->idcrew;
	cop->fltId = 0;
	//20180903 ain, mantis#3958, addCop()补齐赋值cop.pairingId
	cop->pairingId = pairingId;
	cop->assignment = roster->duty;
	cop->role = roster->role;
	cop->subRole = roster->subRole;
	cop->seqOrder = roster->seqOrder;
	crewOnPairing[pairingId].push_back(cop);
	return SUCCESS;
}

int addCrewOnPairingToMap(long long pairingId, SharedPtr<CREW> crew, SharedPtr<CrewOnFlight>& cop, map<long long, list<SharedPtr<CrewOnFlight>>>& crewOnPairing) {

	if (pairingId == 0)
		return SUCCESS;

	//检查是否已经存在
	bool alreadyExist = false;
	if (crewOnPairing.find(pairingId) != crewOnPairing.end()) {
		list<SharedPtr<CrewOnFlight>>& copList = crewOnPairing[pairingId];
		for (list<SharedPtr<CrewOnFlight>>::iterator it = copList.begin(); it != copList.end(); it++) {
			if ((*it)->crewId == cop->crewId) {
				alreadyExist = true;
				break;
			}
		}
	}
	if (alreadyExist)
		return ERR_ALREADY_EXIST;
	//检查pairingId是否已经存在
	if (crewOnPairing.find(pairingId) == crewOnPairing.end()) {
		crewOnPairing[pairingId] = list<SharedPtr<CrewOnFlight>>();
	}
	if (cop->crew.get() == NULL)
		cop->crew = crew;
	crewOnPairing[pairingId].push_back(cop);
	return SUCCESS;
}


int addCrewOnFlightToMap(long long flightId, SharedPtr<CREW> crew, SharedPtr<CrewOnFlight>& cof, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt) {

	if (flightId == 0)
		return SUCCESS;

	//检查是否已经存在
	bool alreadyExist = false;
	if (crewOnFlt.find(flightId) != crewOnFlt.end()) {
		vector<SharedPtr<CrewOnFlight>>& cofList = crewOnFlt[flightId];
		for (vector<SharedPtr<CrewOnFlight>>::iterator it = cofList.begin(); it != cofList.end(); it++) {
			if ((*it)->crewId == cof->crewId) {
				alreadyExist = true;
				break;
			}
		}
	}
	if (alreadyExist)
		return ERR_ALREADY_EXIST;
	//检查pairingId是否已经存在
	if (crewOnFlt.find(flightId) == crewOnFlt.end()) {
		crewOnFlt[flightId] = vector<SharedPtr<CrewOnFlight>>();
	}
	if (cof->crew.get() == NULL)
		cof->crew = crew;
	crewOnFlt[flightId].push_back(cof);
	return SUCCESS;
}


int removeCrewOnPairing(long long pairingId, SharedPtr<CREW> crew, map<long long, list<SharedPtr<CrewOnFlight>>>& crewOnPairing) {
	//检查是否已经存在
	SharedPtr<CrewOnFlight> cop;
	if (crewOnPairing.find(pairingId) != crewOnPairing.end()) {
		list<SharedPtr<CrewOnFlight>>& copList = crewOnPairing[pairingId];
		for (list<SharedPtr<CrewOnFlight>>::iterator it = copList.begin(); it != copList.end(); it++) {
			if ((*it)->crewId == crew->idCrew) {
				cop = (*it);
				break;
			}
		}
	}
	if (!cop.get()) {
		return ERR_NOT_FOUND;
	}
	crewOnPairing[pairingId].remove(cop);
	return SUCCESS;
}


void resetCrewOnFltForPairingUpdate(Pairing* oldPairing, Pairing* newPairing, map<string, SharedPtr<CREW>>& pairingCrews, map<string, SharedPtr<ROSTER>>& pairingRosters, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt) {

	map<long long, bool> oldFltIds;
	map<long long, string> newFltIds;
	for (std::size_t i = 0; i < oldPairing->getNumDuties(); i++) {
		Duty * d = oldPairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* s = d->getSegment(j);
			if (s->getDBId() != 0)
				oldFltIds[s->getDBId()] = true;
		}
	}
	for (std::size_t i = 0; i < newPairing->getNumDuties(); i++) {
		Duty * d = newPairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* s = d->getSegment(j);
			if (s->getDBId() != 0)
				newFltIds[s->getDBId()] = s->getAssignment();
		}
	}
	//原pairing包含、新pairing不包含的flt, 移除 cof
	for (auto& it : oldFltIds) {
		long long fltId = it.first;
		if (newFltIds.find(fltId) == newFltIds.end()) {
			for (auto& itCrew : pairingCrews) {
				string crewId = itCrew.first;
				removeCrewOnFlight(crewId, fltId, oldPairing->getDbId(), crewOnFlt);
			}
		}
	}
	//原pairing不包含、新pairing包含的flt，新增 cof
	for (auto& it : newFltIds) {
		long long fltId = it.first;
		string assignment = it.second;
		if (oldFltIds.find(fltId) == oldFltIds.end()) {
			for (auto& itCrew : pairingCrews) {
				SharedPtr<CREW>& crew = itCrew.second;
				SharedPtr<ROSTER>& roster = pairingRosters[crew->idCrew];
				addCrewOnFlight(crew, roster->pairId, fltId, roster->actingRank, assignment, roster->role, roster->subRole, crewOnFlt);
			}
		}
	}
}

void logCrewOnFlight(const char * msg, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt) {
	Logger::getRuleLogger()->info("[Log CrewOnFlt] {}", msg);
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>::iterator it;
	for (it = crewOnFlt.begin(); it != crewOnFlt.end(); it++) {
		std::ostringstream oss;
		for (std::size_t i = 0; i < it->second.size(); i++) {
			oss << " " << it->second[i]->crewId.c_str();
		}
		Logger::getRuleLogger()->info("\tflt_id={}, crewId=[{}]", it->first, oss.str());
	}
}

void logCrewOnFlight(const char * msg, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, Pairing * pairing) {
	if (pairing == NULL)
		return;

	vector<long long> fltIdList;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment * s = d->getSegment(j);
			if (s->getDBId() != 0) {
				fltIdList.push_back(s->getDBId());
			}
		}
	}
	logCrewOnFlight(msg, crewOnFlt, fltIdList);
}

void logCrewOnFlight(const char * msg, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, vector<long long>& targetFltId) {
	Logger::getRuleLogger()->info("[Log CrewOnFlt] {}", msg);

	map<long long, long long> targetFltIdMap;
	for (std::size_t i = 0; i < targetFltId.size(); i++) {
		targetFltIdMap[targetFltId[i]] = targetFltId[i];
	}

	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>::iterator it;
	for (it = crewOnFlt.begin(); it != crewOnFlt.end(); it++) {
		if (targetFltIdMap.find(it->first) == targetFltIdMap.end()) {
			continue;
		}
		std::ostringstream oss;
		for (std::size_t i = 0; i < it->second.size(); i++) {
			oss <<" "<< it->second[i]->crewId.c_str() << "(" << it->second[i]->role.c_str() << "/" << it->second[i]->subRole.c_str() << ")";
		}
		Logger::getRuleLogger()->info("\tflt_id={}, value=[{}]", it->first, oss.str());
	}
}