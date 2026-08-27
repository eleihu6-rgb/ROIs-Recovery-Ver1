#include <stdio.h>
#include <vector>

#include <sstream>
#include <iostream>
#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "DataCheck.h"
#include "OrLog.h"
#include "Log/Logger.h"
#include "UtilFunc.h"

using namespace std;

typedef unsigned char byte;

#define CHECK_SUCCESS(msg) if (ctx->errorCode != DB_SUCCESS) { goto CLEANUP; }; Logger::getRuleLogger()->info("{} done ", msg);

int calculateSumValue(map<string, int>& m) {
	int sum = 0;
	for (map<string, int>::iterator it = m.begin(); it != m.end(); it++) {
		sum += it->second;
	}
	return sum;
}

string concateManToStr(map<string, int>& m) {
	stringstream ss;
	for (map<string, int>::iterator it = m.begin(); it != m.end(); it++) {
		ss << it->first << ":" << it->second << " ";
	}
	return ss.str();
}



void DataCheck::init(vector<string>& baseList, vector<string>& fleetList, vector<string>& rankList, map<string, SharedPtr<ASSIGNMENT>> &assignmentNameMap) {
	this->baseList = baseList;
	this->fleetList = fleetList;
	this->rankList = rankList;
	this->assignmentNameMap = assignmentNameMap;
}

bool DataCheck::check(vector<Pairing*>& pairingList, vector<SharedPtr<ROSTER>>& rosterList) {
	if (!checkPairing(pairingList)) {
		return false;
	}
	if (!checkRoster(rosterList)) {
		return false;
	}
	return true;
}




bool DataCheck::checkCrewRank(vector<SharedPtr<CREW>>& crewList) {
	bool hasError = false;
	int errCount = 0;
	vector<string> errCrewIds;
	for (auto& crew : crewList) {
		if (crew->rankList.empty()) {
			errCount++;
			if (errCount < 10) {
				Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, no crew_rank found for crew={}", crew->idCrew.c_str());
			}
			errCrewIds.emplace_back(crew->idCrew);
			hasError = true;
		}
	}
	if (errCount >= 10) {
		Logger::getRuleLogger()->info("...");
	}
	if (errCount > 0) {
		stringstream ss;
		for (auto& crewId : errCrewIds) {
			ss << crewId << ",";
		}
		Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, no crew_rank found in {} crews, crewIds:{}", errCount, ss.str());
	}
	return !hasError;
}
//检查是否存在异常isPrimeBase数据，即某时刻只有isPrimeBase=N定义，没有isPrimeBase=Y定义
bool DataCheck::checkIsPrimeBase(vector<SharedPtr<CREW>>& crewList) {
	bool success = true;
	map<string, bool> errorMsgOfCrewHasPrintAlready;
	int errCount = 0;//避免log刷屏
	for (auto& crew : crewList) {
		int HAS_PRIME_Y = 0x0001;
		int HAS_PRIME_N = 0x0010;
		map<time_t, unsigned char> isPrimeIndex; //interval-tree
		//
		//20191127 ain, mantis#7175, prime base检查重构, 建立时间序列索引, 索引中每个节点表示从此时到下一节点前的状态
		//如是否包含prime Base, 是否包含 非prime Base
		//输入
		//  SZX 2019-01-01 16:00 9999-12-30 16:00
		//  PEK 2019-10-31 16:00 2019-11-30 15:59
		//输出
		//  2019-01-01 16:00  HAS_PRIME_N=0  HAS_PRIME_Y=1
		//  2019-10-31 16:00  HAS_PRIME_N=16 HAS_PRIME_Y=1
		//  2019-11-30 15:59  HAS_PRIME_N=0  HAS_PRIME_Y=1
		//  9999-12-30 16:00  HAS_PRIME_N=0  HAS_PRIME_Y=0
		//其中 10-31 16:00 节点出现 PRIME_N=16 PRIME_Y=1, 即仅 10-31 ~ 11-30时间段内每一时刻都同时满足 Has_PRIME_N| Has_PRIME_Y
		//计算思路：
		//1. 第一轮：记录所有关键时间点:eff+exp, 按上例第一轮输出
		//    2019-01-01 16:00  HAS_PRIME_N=0  HAS_PRIME_Y=0
		//    2019-10-31 16:00  HAS_PRIME_N=0  HAS_PRIME_Y=0
		//    2019-11-30 15:59  HAS_PRIME_N=0  HAS_PRIME_Y=0
		//    9999-12-30 16:00  HAS_PRIME_N=0  HAS_PRIME_Y=0
		//2. 第二轮：对每一crewBase, 从eff到exp每一节点设置 has_prime_y或 has_prime_n, 按上例第一轮输出
		//    2019-01-01 16:00  HAS_PRIME_N=0  HAS_PRIME_Y=1
		//    2019-10-31 16:00  HAS_PRIME_N=16 HAS_PRIME_Y=1
		//    2019-11-30 15:59  HAS_PRIME_N=0  HAS_PRIME_Y=1
		//    9999-12-30 16:00  HAS_PRIME_N=0  HAS_PRIME_Y=0
		for (auto& cb : crew->baseList) {
			isPrimeIndex[cb->effUtc] = 0;
			isPrimeIndex[cb->expUtc] = 0;
		}
		for (auto& cb : crew->baseList) {
			auto it = isPrimeIndex.find(cb->effUtc);
			for (; it != isPrimeIndex.find(cb->expUtc) && it != isPrimeIndex.end(); it++) {
				it->second |= cb->isPrime ? HAS_PRIME_Y : HAS_PRIME_N;
			}
		}

		///TEST
		//cout << endl;
		//for (auto& cb : crew->baseList) {
		//	cout << "**DBG crewBase " << cb->idCrew
		//		<< " " << cb->base
		//		<< " " << utcToUtcString(cb->effUtc)
		//		<< " " << utcToUtcString(cb->expUtc)
		//		<< endl;
		//}
		//for (auto& it : isPrimeIndex) {
		//	cout << "**DBG isPrimeIndex " << utcToUtcString(it.first)
		//		<< "  HAS_PRIME_N=" << (it.second & HAS_PRIME_N)
		//		<< "  HAS_PRIME_Y=" << (it.second & HAS_PRIME_Y)
		//		<< endl;
		//}
		//检查是否存在只包含isPrimeBase=N的记录
		int count = 0;
		for (auto& it : isPrimeIndex) {
			if ((it.second & HAS_PRIME_N) && !(it.second & HAS_PRIME_Y)) {
				//每个crew只提示一次
				if (errorMsgOfCrewHasPrintAlready.find(crew->idCrew) == errorMsgOfCrewHasPrintAlready.end()) {
					if (errCount++ < 10)
						Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, only Crew_Base.isPrimeBase=N exists on crew={} utc={}", crew->idCrew.c_str(), utcToUtcString(it.first).c_str());
					errorMsgOfCrewHasPrintAlready[crew->idCrew] = true;
					count++;
					//success = false;

				}
			}
		}
		if (count == isPrimeIndex.size())
		{
			success = false;
		}
	}
	if (errCount >= 10) {
		Logger::getRuleLogger()->info("...");
	}
	if (errCount > 0) {
		stringstream ss;
		for (auto& pair : errorMsgOfCrewHasPrintAlready) {
			ss << pair.first << ",";
		}
		Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, no prime base found for {} crews, crewIds:{}", errorMsgOfCrewHasPrintAlready.size(), ss.str());
	}
	return success;
}


#define ADD_ERR_MSG(ss) hasError=true; errorMsg.push_back(ss.str()); ss.str(""); ss.clear();

bool DataCheck::checkPairing(vector<Pairing*>& pairingList) {
	stringstream msg;
	bool hasError = false;

	//mantis#2139, 检查 startUtc > endUtc
	for (Pairing* p : pairingList) {
		if (p->getStartTimeUtc() > p->getEndTimeUtc()) {
			msg << "[DataCheck] ERROR: invalid data, startUtc > endUtc, pairing=" << p->getDbId() << " " << utcToUtcString(p->getStartTimeUtc()) << " " << utcToUtcString(p->getEndTimeUtc());
			ADD_ERR_MSG(msg);
			continue;
		}
	}

	//mantis#1419, 检查 pairingSegment.assignment
	for (Pairing* p : pairingList) {
		for (Duty* d : p->getDutyVec()) {
			for (Segment* s : d->getSegments()) {
				if (assignmentNameMap.find(s->getAssignment()) == assignmentNameMap.end()) {
					msg << "[DataCheck] ERROR: invalid data, pairing=" << p->getDbId() << " segment.assignment=" << s->getAssignment() << " not exist";
					ADD_ERR_MSG(msg);
					continue;
				}
			}
		}
	}

	for (std::size_t i = 0; i < pairingList.size(); i++) {
		Pairing * pairing = pairingList[i];
		if (pairing->getBase() == "") {
			msg << "[DataCheck] ERROR: invalid base='" << pairing->getBase() << "' of pairing=" << pairing->getDbId();
			ADD_ERR_MSG(msg);
			continue;
		}

		//if (pairing->getCompositionId() == 0) {
		//	msg << "invalid compositionId='" << pairing->getCompositionId() << "' of pairing=" << pairing->getDbId();
		//	return false;
		//}
		if (pairing->getPrimeActivity() == "FLY") {
			std::size_t segCount = 0;
			for (std::size_t j = 0; j < pairing->getNumDuties(); j++) {
				Duty * duty = pairing->getDuty(j);
				segCount += duty->getNumSegments();
			}
			if (segCount == 0) {
				msg << "[DataCheck] ERROR: invalid data no segments in pairing='" << pairing->getDbId();
				ADD_ERR_MSG(msg);
				continue;
			}
		}

		if (calculateSumValue(pairing->getComplements()) == 0) {
			stringstream ss;
			ss << "[DataCheck] empty composition='" << concateManToStr(pairing->getComplements()) << "' of pairing=" << pairing->getDbId();
			warning.push_back(ss.str());
		}

		for (std::size_t j = 0; j < pairing->getNumDuties(); j++) {
			Duty * duty = pairing->getDuty(j);
			if (duty->getDepStation() == "") {
				msg << "[DataCheck] ERROR: invalid dep-Station='" << duty->getDepStation() << "' of duty[" << (j + 1) << "] of pairing=" << pairing->getDbId();
				ADD_ERR_MSG(msg);
				continue;
			}
			if (duty->getArrStation() == "") {
				msg << "[DataCheck] ERROR: invalid arr-Station='" << duty->getArrStation() << "' of duty[" << (j + 1) << "] of pairing=" << pairing->getDbId();
				ADD_ERR_MSG(msg);
				continue;
			}

			for (std::size_t k = 0; k < duty->getNumSegments(); k++) {
				Segment * seg = duty->getSegment(k);
				if (seg->getDepStation() == "") {
					msg << "[DataCheck] ERROR: invalid dep-Station='" << seg->getDepStation() << "' of segment[flt_id=" << seg->getDBId() << "] of duty[" << (j + 1) << "] of pairing=" << pairing->getDbId();
					ADD_ERR_MSG(msg);
					continue;
				}
				if (seg->getArrStation() == "") {
					msg << "[DataCheck] ERROR: invalid arr-Station='" << seg->getArrStation() << "' of segment[flt_id=" << seg->getDBId() << "] of duty[" << (j + 1) << "] of pairing=" << pairing->getDbId();
					ADD_ERR_MSG(msg);
					continue;
				}


			}
		}
	}
	return !hasError;
}

//20180822 ain, mantis#3867, 数据检查空duty
//OK: true, hasError: false
bool DataCheck::checkDutyEmpty(vector<Pairing*>& pairingList) {
	bool hasErr = false;
	int errCount = 0;
	unordered_multimap<long long, long long> errPairingDutyIdMap;//<PairingId, DutyId>
	for (Pairing * p : pairingList) {
		if (p->getNumDuties() == 0) {
			errCount++;
			if (errCount <= 10) {
				Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, no duty in pairing=<< {} {} {} {} {}",
					p->getDbId(), utcToUtcDtString(p->getStartTimeLocSch()), p->getBase(), p->getPrimeActivity(), p->getLabel());
			}
			errPairingDutyIdMap.insert(std::make_pair(p->getDbId(), -1));
			hasErr = true;
		}
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty * d = p->getDuty(i);
			if (d->getNumSegments() == 0) {
				errCount++;
				//20200412 ain, 修正日志 no duty[i] -> no segments in duty[i]
				if (errCount <= 10) {
					Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, no segments in duty[{}] pairing=<< {} {} {} {} {}",
						i, p->getDbId(), utcToUtcDtString(p->getStartTimeLocSch()), p->getBase(), p->getPrimeActivity(), p->getLabel());
				}
				errPairingDutyIdMap.insert(std::make_pair(d->getPairingId(), d->getDutyId()));
				hasErr = true;
			}
			if (d->pairingDutyNodes.size() < 4) {
				errCount++;
				//20200412 ain, 修正日志 no duty[i] -> no segments in duty[i]
				if (errCount <= 10) {
					Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, missing duty node in duty[{}] pairing=<< {} {} {} {} {}",
						i, p->getDbId(), utcToUtcDtString(p->getStartTimeLocSch()), p->getBase(), p->getPrimeActivity(), p->getLabel());
				}
				errPairingDutyIdMap.insert(std::make_pair(d->getPairingId(), d->getDutyId()));
				hasErr = true;
			}
		}
	}
	if (errCount > 10) {
		cout << "...";
	}
	if (errCount > 0) {
		stringstream ss;
		for (auto& pair : errPairingDutyIdMap) {
			ss << pair.first << ":";//pairingId
			if (pair.second > 0) {
				ss << pair.second; //dutyId
			}
			ss << ",";
		}
		Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, errCount={}, pairingId and dutyId={}", errCount, ss.str());
	}
	return !hasErr;
	//return true;
}

bool DataCheck::checkDutyEmpty(Pairing* pairing) {
	vector<Pairing*> pairingList;
	pairingList.emplace_back(pairing);
	return checkDutyEmpty(pairingList);
}

bool DataCheck::checkPairingAboutFDP(vector<Pairing*>& pairingList) {
	bool bReturn = true;
	for (std::size_t i = 0; i < pairingList.size(); i++) {
		Pairing * pairing = pairingList[i];
		for (std::size_t j = 0; j < pairing->getNumDuties(); j++) {
			Duty * duty = pairing->getDuty(j);
			for (std::size_t k = 0; k < duty->getNumSegments(); k++) {
				Segment * seg = duty->getSegment(k);
			}
		}

	}

	return  bReturn;
} 

bool DataCheck::checkRoster(vector<SharedPtr<ROSTER>>& rosterList) {
	bool hasError = false;
	stringstream msg;
	map<string, int> scenarioBaseMap;

	for (std::size_t i = 0; i < this->baseList.size(); i++) {
		scenarioBaseMap[baseList[i]] = 1;
	}

	for (std::size_t i = 0; i < rosterList.size(); i++) {
		SharedPtr<ROSTER>& roster = rosterList[i];

		//检查是否无法确定base/location
		if (roster->pairId == 0 && roster->location == "") {
			msg << "[DataCheck] ERROR: location is null of roster=" << roster->rosterId;
			ADD_ERR_MSG(msg);
			continue;
		}

		//检查是否有关联pairing但未能读取
		//if (roster->pairId != 0 && roster->pairing == NULL) {
		//	msg << "ERROR: roster=" << roster->rosterId << " with pair_id=" << roster->pairId << " BUT roster.pairing is NULL";
		//	ADD_ERR_MSG(msg);
		//	continue;
		//}

		//检查pairing.base roster.location匹配
		//if (roster->pairing && roster->location != "" && roster->location != roster->pairing->getBase()) {
		//	msg << "ERROR: roster=" << roster->rosterId << " roster.location and pairing.base not match";
		//	ADD_ERR_MSG(msg);
		//	continue;
		//}

		//检查scenario.base_id
		//string base = roster->location;
		//if (base == "") base = roster->pairing->getBase();
		//if (scenarioBaseMap.find(base) == scenarioBaseMap.end()) {
		//	msg << "ERROR: roster=" << roster->rosterId << " base=" << base << " not match scenario.base_id";
		//	ADD_ERR_MSG(msg);
		//	continue;
		//}

		//检查roster与pairing时间
		if (roster->pairing && roster->strUtc != roster->pairing->getStartTimeUtc()) {
			msg << "[DataCheck] ERROR: roster=" << roster->rosterId << " roster.startUtc and pairing.startUtc time not match";
			ADD_ERR_MSG(msg);
			continue;
		}
		if (roster->pairing && roster->restStrUtc != roster->pairing->getEndTimeUtc()) {
			msg << "[DataCheck] ERROR: roster=" << roster->rosterId << " roster.restStrUtc and pairing.endUtc time not match";
			ADD_ERR_MSG(msg);
			continue;
		}

		//检查FLY任务必须有pairing
		if (roster->duty == "FLY" && roster->pairing == NULL) {
			msg << "[DataCheck] ERROR: roster=" << roster->rosterId << " is FLY duty BUT roster.pairing=" << roster->pairId << " not exist";
			ADD_ERR_MSG(msg);
			continue;
		}
	}
	return !hasError;
}




bool DataCheck::isWarningExists() {
	return !warning.empty();
}
vector<string>& DataCheck::getWarning() {
	return warning;
}
vector<string>& DataCheck::getErrorMsg() {
	return errorMsg;
}


void DataCheck::printError() {
	for (std::size_t i = 0; i < errorMsg.size(); i++) {
		cout << errorMsg[i] << endl;
	}
}