#include "DutyUtils.h"

#undef NDEBUG
#include <cassert>
#include <algorithm>
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"
#include "TimeUtils.h"
#include "UtilFunc.h"

std::string DutyUtils::GetFiliale(const Duty& duty, const SharedPtr<CrewDataContext>& dbData) {
	auto iterPair = dbData->pairingIdMap.find(duty.getPairingId());
	if (iterPair == dbData->pairingIdMap.end()) {
		return "";
	}
	string filiale = iterPair->second->getFiliale();
	if (filiale == "" && duty.getSegments().size() > 0) {
		auto fltId = const_cast<Duty&>(duty).getSegment(0)->getDBId();
		auto iterFlt = dbData->flightIdMap.find(fltId);
		if (iterFlt != dbData->flightIdMap.end()) {
			filiale = iterFlt->second->getAirline();
		}

	}
	return filiale;
}

int DutyUtils::GetTimeZoneOffset(const Duty& duty, const SharedPtr<CrewDataContext>& dbData) {
	return GetTimeZoneOffsetByDep(duty, dbData);
}

int DutyUtils::GetTimeZoneOffsetByDep(const Duty& duty, const SharedPtr<CrewDataContext>& dbData) {
	string station = duty.getDepartureStation();
	string depZoneId = dbData->getAirportZoneId(station);
	int offset = TimezoneUtils::GetTimezoneOffset(duty.getStartTimeUtcAct(), depZoneId);
	return offset;
}

int DutyUtils::GetTimeZoneOffsetByArr(const Duty& duty, const SharedPtr<CrewDataContext>& dbData) {
	string station = duty.getArrivalStation();
	string arrZoneId = dbData->getAirportZoneId(station);
	int offset = TimezoneUtils::GetTimezoneOffset(duty.getEndTimeUtcAct(), arrZoneId);
	return offset;
}

//获得Duty的时差(分钟数）
int DutyUtils::GetTimeZoneDiff(const Duty& duty, const SharedPtr<CrewDataContext>& dbData) {
	//int depOffsetTZ = dbData->getAirportOffsetMinutes(duty.getDepartureStation());
	//int arrOffsetTZ = dbData->getAirportOffsetMinutes(duty.getArrivalStation());
	//int displacementTime = arrOffsetTZ - depOffsetTZ;
	//return displacementTime;
	string depZoneId = dbData->getAirportZoneId(duty.getDepartureStation());
	string arrZoneId = dbData->getAirportZoneId(duty.getArrivalStation());
	int displacementTime = TimezoneUtils::GetTimezoneOffsetByStart(duty.getStartTimeUtcAct(), depZoneId, arrZoneId);
	return displacementTime;
}

//获得prevDuty和duty的时差(分钟数）
int DutyUtils::GetTimeZoneDiff(const Duty& prevDuty, const Duty& duty, const SharedPtr<CrewDataContext>& dbData) {
	//int prevDutyDepOffsetTZ = dbData->getAirportOffsetMinutes(prevDuty.getDepartureStation());
	//int dutyDepOffsetTZ = dbData->getAirportOffsetMinutes(duty.getDepartureStation());
	//int displacementTime = dutyDepOffsetTZ - prevDutyDepOffsetTZ;
	//return displacementTime;
	string prevDutyDepZoneId = dbData->getAirportZoneId(prevDuty.getDepartureStation());
	string dutyDepZoneId = dbData->getAirportZoneId(duty.getDepartureStation());
	int displacementTime = TimezoneUtils::GetTimezoneOffsetByStart(prevDuty.getStartTimeUtcAct(), prevDutyDepZoneId, dutyDepZoneId);
	return displacementTime;
}

//获得prevDuty和duty的时差(分钟数）
int DutyUtils::GetTimeZoneDiffByArr(const Duty& prevDuty, const Duty& duty, const SharedPtr<CrewDataContext>& dbData) {
	//int prevDutyDepOffsetTZ = dbData->getAirportOffsetMinutes(prevDuty.getDepartureStation());
	//int dutyDepOffsetTZ = dbData->getAirportOffsetMinutes(duty.getDepartureStation());
	//int displacementTime = dutyDepOffsetTZ - prevDutyDepOffsetTZ;
	//return displacementTime;
	string prevDutyDepZoneId = dbData->getAirportZoneId(prevDuty.getArrStation());
	string dutyDepZoneId = dbData->getAirportZoneId(duty.getArrStation());
	int displacementTime = TimezoneUtils::GetTimezoneOffset(prevDuty.getEndTimeUtcAct(), prevDutyDepZoneId, duty.getEndTimeUtcAct(), dutyDepZoneId);
	return displacementTime;
}

std::string DutyUtils::GetDisplacementDirection(int depOffsetTZ, int arrOffsetTZ) {
	bool eastward = false;
	if (depOffsetTZ >= 0 && arrOffsetTZ <= 0) {
		//“由正时区，飞到负时区” 或 “未跨时区”，认为向东飞
		eastward = true;
	}
	else if (depOffsetTZ < 0 && arrOffsetTZ >= 0) {
		//“由负时区，飞到正时区”，认为向西飞
		eastward = false;
	}
	else {
		eastward = (arrOffsetTZ >= depOffsetTZ);
	}
	return eastward ? DisplacementDirection::EAST : DisplacementDirection::WEST;
}

std::string DutyUtils::GetDisplacementDirection(const Duty& duty, const SharedPtr<CrewDataContext>& dbData) {
	//int depOffsetTZ = dbData->getAirportOffsetMinutes(duty.getDepartureStation());
	//int arrOffsetTZ = dbData->getAirportOffsetMinutes(duty.getArrivalStation());
	//return GetDisplacementDirection(depOffsetTZ, arrOffsetTZ);

	string depZoneId = dbData->getAirportZoneId(duty.getDepartureStation());
	string arrZoneId = dbData->getAirportZoneId(duty.getArrivalStation());
	int depOffsetTZ = TimezoneUtils::GetTimezoneOffset(duty.getStartTimeUtcAct(), depZoneId);
	int arrOffsetTZ = TimezoneUtils::GetTimezoneOffset(duty.getStartTimeUtcAct(), arrZoneId);
	return GetDisplacementDirection(depOffsetTZ, arrOffsetTZ);
}

std::string DutyUtils::GetDisplacementDirection(const Duty& prevDuty, const Duty& currDuty, const SharedPtr<CrewDataContext>& dbData) {
	//int prevDutyDepOffsetTZ = dbData->getAirportOffsetMinutes(prevDuty.getDepartureStation());
	//int currDutyDepOffsetTZ = dbData->getAirportOffsetMinutes(currDuty.getDepartureStation());
	//return GetDisplacementDirection(prevDutyDepOffsetTZ, currDutyDepOffsetTZ);

	string prevDutyDepZoneId = dbData->getAirportZoneId(prevDuty.getDepartureStation());
	string currDutyZoneId = dbData->getAirportZoneId(currDuty.getDepartureStation());
	int prevDutyDepOffsetTZ = TimezoneUtils::GetTimezoneOffset(prevDuty.getStartTimeUtcAct(), prevDutyDepZoneId);
	int currDutyOffsetTZ = TimezoneUtils::GetTimezoneOffset(prevDuty.getStartTimeUtcAct(), currDutyZoneId);
	return GetDisplacementDirection(prevDutyDepOffsetTZ, currDutyOffsetTZ);
}

int DutyUtils::GetIntervalFromSS(const Duty& prevDuty, const Duty& currDuty) {
	return static_cast<int>(const_cast<Duty&>(currDuty).getStartTimeUtcAct() - const_cast<Duty&>(prevDuty).getStartTimeUtcAct());
	//return static_cast<int>(const_cast<Duty&>(currDuty).getFirstBreif()->getStartUtc() - const_cast<Duty&>(prevDuty)..getFirstBreif()->getStartUtc());//与上面等价
}

string DutyUtils::GetCompositionByDutyFor3(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, string division) {
	int application = RuleParams::GetInstancePtr()->getApplication();

	//获取不到配比，默认配比处理方式 取值：MIN - 最小配比、FLT - 获得航班， NA - 返回空配比
	string defaultCompositionMode = dbData->getSystemParamValue("DEFAULT_COMPOSITION_MODE", "FLT");

	string compName;
	long long compid = -9999;
	int hierarchy = 999999;
	bool matched = false;

	// 跳过duty composition重算：调用方设置了duty complement map的情况下, 不重算
	// 包括：最小合规配比 min-legal-complement 候选; pairing optimizer.
	const auto& dutyComplements = duty->getComplementMap();
	if (!dutyComplements.empty() && !duty->getCompositionName().empty()) {
		return duty->getCompositionName();
	}

	for (std::size_t i = 0; i < duty->getNumSegments(); i++) {
		Segment* s = duty->getSegment(i);
		if (!s->getIsOperating() || s->getAssignment() == "DHD" || s->getAssignment() == "BUS") {
			continue;
		}
		long long fltId = s->getDBId();
		map<string, int> rankMap;

		if (dbData->flightIdToPairing.find(fltId) == dbData->flightIdToPairing.end()) {
			Logger::getRuleLogger()->error("[DutyUtils::GetCompositionByDutyFor3] flightIdToPairing[{}] is null. pairingId={}, dutyId={}", fltId, duty->getPairingId(), duty->getDutyId());
			continue;
		}

		for (std::size_t j = 0; j < dbData->flightIdToPairing[fltId].size(); j++) {
			long long id = dbData->flightIdToPairing[fltId][j];
			map<string, int>::iterator iter;
			if (dbData->pairingIdMap.find(id) != dbData->pairingIdMap.end()) {
				iter = dbData->pairingIdMap[id]->getComplements().begin();
				while (iter != dbData->pairingIdMap[id]->getComplements().end()) {
					if (dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
						iter++;
						continue;
					}
					if ((dbData->rankMap[iter->first].division == division || division == "") && dbData->rankMap[iter->first].isMustCrewRank) {
						rankMap[iter->first] += iter->second;
					}
					iter++;
				}
			}
		}
		matched = true;
		if (rankMap.size() == 0 && division == "") {
			//if (application == ROSTER_EDITOR || application == PAIRING_EDITOR) {
			//	Logger::getRuleLogger()->error("[1] Duty does not match the composition, return default composition=[{}], paringId:{}, dutyId:{}, duty Assignment:{} division is empty",
			//		dbData->getDefaultComposition(), duty->getPairingId(), duty->getDutyId(), duty->getAssignment());
			//}
			return "";
		}
		if (rankMap.size() == 0) {
			//if (application == ROSTER_EDITOR || application == PAIRING_EDITOR) {
			//	Logger::getRuleLogger()->error("[2] Duty does not match the composition, return default composition=[{}], paringId:{}, dutyId:{}, duty Assignment:{}",
			//		dbData->getDefaultComposition(), duty->getPairingId(), duty->getDutyId(), duty->getAssignment());
			//}
			return "";
		}
		unordered_map<long long, unordered_map<int, composition_rank>>::iterator compIter;
		unordered_map<int, composition_rank>::iterator optionIter;
		map<string, int>::iterator rankIter;
		compIter = dbData->compositionRankOptionMap.begin();
		while (compIter != dbData->compositionRankOptionMap.end()) {
			bool isOk = false;
			optionIter = compIter->second.begin();
			while (optionIter != compIter->second.end()) {

				int iCount = 0;
				int k = -1;
				if (optionIter->second.rankCount == rankMap.size()) {
					for (k = 0; k < optionIter->second.rankCount; k++) {
						string rank = optionIter->second.rankValue[k].rank;
						if (rank == "") {
							continue;
						}
						if (rankMap.find(rank) != rankMap.end() && rankMap[rank] == optionIter->second.rankValue[k].plan_value) {
							iCount++;
						}
						else {
							continue;
						}
					}
				}
				if (iCount == rankMap.size() && k >= optionIter->second.rankCount) {
					isOk = true;
					break;
				}
				optionIter++;
			}

			if (isOk && hierarchy > compIter->second.begin()->second.hierarchy) {
				compid = compIter->first;
				hierarchy = compIter->second.begin()->second.hierarchy;
			}
			compIter++;
		}
	}
	for (auto& composition : dbData->compositionList) {
		if (composition.getCompositionId() == compid) {
			compName = composition.getName();
			break;
		}
	}

	//if (compName.empty() && (application == ROSTER_EDITOR || application == PAIRING_EDITOR)) {
	//	Logger::getRuleLogger()->error("[3] Duty does not match the composition, return default composition=[{}], paringId:{}, dutyId:{}, duty Assignment:{}",
	//		dbData->getDefaultComposition(), duty->getPairingId(), duty->getDutyId(), duty->getAssignment());
	//}
	//通过Flight的Pairing._complements 无法找到Duty配比，此时才使用默认配比。针对Pairing配比为OVER:1，Duty配比仍然返回空
	if (matched && compName.empty()) {
		if (defaultCompositionMode == "FLT") {
			compName = GetCompositionByDutySegmentFor3(duty, dbData, division);
		}
		else {
			compName = dbData->getDefaultComposition(defaultCompositionMode);
		}
	}
	const_cast<Duty*>(duty)->setCompositionName(compName);
	return compName;
}

string DutyUtils::GetCompositionByDutyFor3(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, const bool isOnlyCurrentPairing, string division) {
	int application = RuleParams::GetInstancePtr()->getApplication();

	//获取不到配比，默认配比处理方式 取值：MIN - 最小配比、FLT - 获得航班， NA - 返回空配比
	string defaultCompositionMode = dbData->getSystemParamValue("DEFAULT_COMPOSITION_MODE", "FLT");

	string compName;
	long long compid = -9999;
	int hierarchy = 999999;
	bool matched = false;
	for (std::size_t i = 0; i < duty->getNumSegments(); i++) {
		Segment* s = duty->getSegment(i);
		if (!s->getIsOperating() || s->getAssignment() == "DHD" || s->getAssignment() == "BUS") {
			continue;
		}
		long long fltId = s->getDBId();
		map<string, int> rankMap;

		if (dbData->flightIdToPairing.find(fltId) == dbData->flightIdToPairing.end()) {
			Logger::getRuleLogger()->error("[DutyUtils::GetCompositionByDutyFor3] flightIdToPairing[{}] is null. pairingId={}, dutyId={}", fltId, duty->getPairingId(), duty->getDutyId());
			continue;
		}

		for (std::size_t j = 0; j < dbData->flightIdToPairing[fltId].size(); j++) {
			long long pairingId = dbData->flightIdToPairing[fltId][j];
			if (isOnlyCurrentPairing && pairingId != duty->getPairingId()) {
				continue;
			}
			map<string, int>::iterator iter;
			if (dbData->pairingIdMap.find(pairingId) != dbData->pairingIdMap.end()) {
				iter = dbData->pairingIdMap[pairingId]->getComplements().begin();
				while (iter != dbData->pairingIdMap[pairingId]->getComplements().end()) {
					if (dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
						iter++;
						continue;
					}
					if ((dbData->rankMap[iter->first].division == division || division == "") && dbData->rankMap[iter->first].isMustCrewRank) {
						rankMap[iter->first] += iter->second;
					}
					iter++;
				}
			}
		}
		matched = true;
		if (rankMap.size() == 0 && division == "") {
			//if (application == ROSTER_EDITOR || application == PAIRING_EDITOR) {
			//	Logger::getRuleLogger()->error("[1] Duty does not match the composition, return default composition=[{}], paringId:{}, dutyId:{}, duty Assignment:{} division is empty",
			//		dbData->getDefaultComposition(), duty->getPairingId(), duty->getDutyId(), duty->getAssignment());
			//}
			return "";
		}
		if (rankMap.size() == 0) {
			//if (application == ROSTER_EDITOR || application == PAIRING_EDITOR) {
			//	Logger::getRuleLogger()->error("[2] Duty does not match the composition, return default composition=[{}], paringId:{}, dutyId:{}, duty Assignment:{}",
			//		dbData->getDefaultComposition(), duty->getPairingId(), duty->getDutyId(), duty->getAssignment());
			//}
			return "";
		}
		unordered_map<long long, unordered_map<int, composition_rank>>::iterator compIter;
		unordered_map<int, composition_rank>::iterator optionIter;
		map<string, int>::iterator rankIter;
		compIter = dbData->compositionRankOptionMap.begin();
		while (compIter != dbData->compositionRankOptionMap.end()) {
			bool isOk = false;
			optionIter = compIter->second.begin();
			while (optionIter != compIter->second.end()) {

				int iCount = 0;
				int k = -1;
				if (optionIter->second.rankCount == rankMap.size()) {
					for (k = 0; k < optionIter->second.rankCount; k++) {
						string rank = optionIter->second.rankValue[k].rank;
						if (rank == "") {
							continue;
						}
						if (rankMap.find(rank) != rankMap.end() && rankMap[rank] == optionIter->second.rankValue[k].plan_value) {
							iCount++;
						}
						else {
							continue;
						}
					}
				}
				if (iCount == rankMap.size() && k >= optionIter->second.rankCount) {
					isOk = true;
					break;
				}
				optionIter++;
			}

			if (isOk && hierarchy > compIter->second.begin()->second.hierarchy) {
				compid = compIter->first;
				hierarchy = compIter->second.begin()->second.hierarchy;
			}
			compIter++;
		}
	}
	for (auto& composition : dbData->compositionList) {
		if (composition.getCompositionId() == compid) {
			compName = composition.getName();
			break;
		}
	}

	//if (compName.empty() && (application == ROSTER_EDITOR || application == PAIRING_EDITOR)) {
	//	Logger::getRuleLogger()->error("[3] Duty does not match the composition, return default composition=[{}], paringId:{}, dutyId:{}, duty Assignment:{}",
	//		dbData->getDefaultComposition(), duty->getPairingId(), duty->getDutyId(), duty->getAssignment());
	//}
	//通过Flight的Pairing._complements 无法找到Duty配比，此时才使用默认配比。针对Pairing配比为OVER:1，Duty配比仍然返回空
	if (matched && compName.empty()) {
		if (defaultCompositionMode == "FLT") {
			return GetCompositionByDutySegmentFor3(duty, dbData, division);
		}
		else {
			return dbData->getDefaultComposition(defaultCompositionMode);
		}
	}
	return compName;
}


string DutyUtils::GetCompositionByDutySegmentFor3(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, string division) {
	string compName;
	long long compid = -9999;
	int hierarchy = 999999;
	for (std::size_t i = 0; i < duty->getNumSegments(); i++) {
		Segment* s = duty->getSegment(i);
		if (!s->getIsOperating() || s->getAssignment() == "DHD" || s->getAssignment() == "BUS") {
			continue;
		}
		long long fltId = s->getDBId();
		map<string, int> rankMap;
		//rankMap由Pairing改成通过Flight获取，原因：横切后Pairing的Complements不完整，会导致无法找到配比
		//方法1：通过Pairing寻找RankMap，见getCompositionByDutyFor3()
		//for (int j = 0; j < this->_dbData->flightIdToPairing[fltId].size(); j++) {
		//	int id = this->_dbData->flightIdToPairing[fltId][j];
		//	map<string, int>::iterator iter;
		//	if (this->_dbData->pairingIdMap.find(id) != this->_dbData->pairingIdMap.end()) {
		//		iter = this->_dbData->pairingIdMap[id]->getComplements().begin();
		//		while (iter != this->_dbData->pairingIdMap[id]->getComplements().end()) {
		//			if (this->_dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
		//				iter++;
		//				continue;
		//			}
		//			if ((this->_dbData->rankMap[iter->first].division == division || division == "") && this->_dbData->rankMap[iter->first].isMustCrewRank) {
		//				rankMap[iter->first] += iter->second;
		//			}
		//			iter++;
		//		}
		//	}
		//}
		//方法2：通过Flight寻找RankMap
		auto iterFlight = dbData->flightIdMap.find(fltId);
		if (iterFlight != dbData->flightIdMap.end()) {
			if (iterFlight->second == nullptr) {
				Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, flight do not exist. FlightId:{}, PairingId:{}, DutyId:{}, method=getCompositionByDutySegmentFor3", fltId, s->getPairingId(), s->getDutyId());
			}
			else {
				auto iter = iterFlight->second->getPlanComposition().begin();
				while (iter != iterFlight->second->getPlanComposition().end()) {
					if (dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
						iter++;
						continue;
					}
					if ((dbData->rankMap[iter->first].division == division || division == "") && dbData->rankMap[iter->first].isMustCrewRank) {
						rankMap[iter->first] += iter->second;
					}
					iter++;
				}
			}

		}

		if (rankMap.size() == 0 && division == "") {
			return "";
		}
		if (rankMap.size() == 0) {
			return "";
		}
		unordered_map<long long, unordered_map<int, composition_rank>>::iterator compIter;
		unordered_map<int, composition_rank>::iterator optionIter;
		map<string, int>::iterator rankIter;
		compIter = dbData->compositionRankOptionMap.begin();
		while (compIter != dbData->compositionRankOptionMap.end()) {
			bool isOk = false;
			optionIter = compIter->second.begin();
			while (optionIter != compIter->second.end()) {

				int iCount = 0;
				int k = -1;
				if (optionIter->second.rankCount == rankMap.size()) {
					for (k = 0; k < optionIter->second.rankCount; k++) {
						string rank = optionIter->second.rankValue[k].rank;
						if (rank == "") {
							continue;
						}
						if (rankMap.find(rank) != rankMap.end() && rankMap[rank] == optionIter->second.rankValue[k].plan_value) {
							iCount++;
						}
						else {
							continue;
						}
					}
				}
				if (iCount == rankMap.size() && k >= optionIter->second.rankCount) {
					isOk = true;
					break;
				}
				optionIter++;
			}

			if (isOk && hierarchy > compIter->second.begin()->second.hierarchy) {
				compid = compIter->first;
				hierarchy = compIter->second.begin()->second.hierarchy;
			}
			compIter++;
		}
	}
	for (auto& composition : dbData->compositionList) {
		if (composition.getCompositionId() == compid) {
			compName = composition.getName();
			break;
		}
	}

	return compName;
}

int DutyUtils::getLangdingNums(const Duty* duty, CrewDataContext* dbData) {
	if (!duty) {
		return 0;
	}
	if (duty->getNumSegments() == 0) {
		return 0;
	}
	int num = 0;
	for (std::size_t i = 0; i < duty->getNumSegments(); i++) {
		Segment* s = duty->getSegment(i);
		Segment* flt = s;
		if (dbData != nullptr) {
			auto iterFlt = dbData->flightIdMap.find(s->getDBId());
			if (iterFlt != dbData->flightIdMap.end()) {
				flt = iterFlt->second.get();
			}
		}

		string ass = s->getAssignment();
		if (flt != nullptr && flt->getFltSts() != "V"
			&& flt->getFltSts() != "R"
			&& s->getIsOperating()) {
			num++;
		}

	}
	return num;
}

//获得Roster的Duty列表
vector<Duty*> DutyUtils::GetDuties(const std::vector<const ROSTER*>& rosters, const SharedPtr<CrewDataContext>& dbData) {
	vector<Duty*> duties;
	for (auto roster : rosters) {
		if (RuleParams::GetInstancePtr()->getApplication() == ROSTER_OPTIMIZER && roster->source == "PA") {
			continue;
		}
		Pairing* pairing = nullptr;
		if (roster->pairId != 0 && dbData->pairingIdMap.find(roster->pairId) != dbData->pairingIdMap.end()) {
			pairing = dbData->pairingIdMap[roster->pairId];
		}
		if (pairing == nullptr) {
			continue;
		}
		for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
			duties.emplace_back(pairing->getDuty(i));
		}
	}
	std::sort(duties.begin(), duties.end(), [](const auto& n1, const auto& n2) {
		return n1->getStartTimeUtcAct() < n2->getStartTimeUtcAct();
	});
	return duties;
}

//获得Roster的Duty列表
vector<std::shared_ptr<DutyExt>> DutyUtils::GetDutyExtes(const std::vector<const ROSTER*>& rosters, const SharedPtr<CrewDataContext>& dbData) {
	vector<std::shared_ptr<DutyExt>> duties;
	for (auto roster : rosters) {
		Pairing* pairing = nullptr;
		if (roster->pairId != 0 && dbData->pairingIdMap.find(roster->pairId) != dbData->pairingIdMap.end()) {
			pairing = dbData->pairingIdMap[roster->pairId];
		}
		if (pairing == nullptr) {
			continue;
		}
		for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
			std::shared_ptr<DutyExt> dutyExt = std::make_shared<DutyExt>();
			dutyExt->duty = pairing->getDuty(i);
			dutyExt->pairingHomeBase = pairing->getBase();
			duties.emplace_back(dutyExt);
		}
	}
	return duties;
}

//判断是否是WOCL
bool DutyUtils::IsWoclDuty(const time_t dutyStartUtc, const int offsetTZMinute) {
	const auto& wocl = RuleParams::GetInstancePtr()->getWOCLDefinition();

	return TimeUtils::IsTimesInRange(dutyStartUtc + offsetTZMinute * 60, wocl.woclStart, wocl.woclEnd);
}

bool DutyUtils::IsWoclDuty(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
	const auto& wocl = RuleParams::GetInstancePtr()->getWOCLDefinition();


	auto depOffsetMinutes = DutyUtils::GetTimeZoneOffsetByDep((*duty), dbData);
	auto arvOffsetMinutes = DutyUtils::GetTimeZoneOffsetByArr((*duty), dbData);

	const auto& fdpStartUtc = duty->getFDPStartUtcTimes();
	const auto& fdpEndUtc = duty->getFDPEndUtcTimes();


	return TimeUtils::IsTimesCovered(fdpStartUtc + depOffsetMinutes * 60, fdpEndUtc + arvOffsetMinutes * 60, wocl.woclStart, wocl.woclEnd);
}

int DutyUtils::GetWoclEnd() {
	const auto& wocl = RuleParams::GetInstancePtr()->getWOCLDefinition();
	return wocl.woclEnd;
}

bool DutyUtils::IsEarlyStartDuty(const time_t dutyStartUtc, const int offsetTZMinute) {
	const auto& earlyStart = RuleParams::GetInstancePtr()->getEarlyStartDefinition();

	return TimeUtils::IsTimesInRange(dutyStartUtc + offsetTZMinute * 60, earlyStart.earlyStartStart, earlyStart.earlyStartEnd);
}

bool DutyUtils::IsEarlyStartDuty(const Duty* duty) {
	time_t dutyStartUtc = duty->getStartTimeUtcAct();
	int ref = duty->getRefTimeZone();

	const auto& earlyStart = RuleParams::GetInstancePtr()->getEarlyStartDefinition();

	return TimeUtils::IsTimesInRange(dutyStartUtc + ref * 60, earlyStart.earlyStartStart, earlyStart.earlyStartEnd);
}

int DutyUtils::GetEarlyStartEnd() {
	const auto& earlyStart = RuleParams::GetInstancePtr()->getEarlyStartDefinition();
	return earlyStart.earlyStartEnd;
}

bool DutyUtils::IsEarlyStartTime(const time_t checkTimeUtc, const int offsetTZMinute) {
	const auto& earlyStart = RuleParams::GetInstancePtr()->getEarlyStartDefinition();

	return TimeUtils::IsTimesInRange(checkTimeUtc + offsetTZMinute * 60, earlyStart.earlyStartStart, earlyStart.earlyStartEnd);
}

bool DutyUtils::IsLateFinishTime(const time_t checkTimeUtc, const int offsetTZMinute) {
	const auto& lateFinish = RuleParams::GetInstancePtr()->getLateFinishDefinition();

	return TimeUtils::IsTimesInRange(checkTimeUtc + offsetTZMinute * 60, lateFinish.lateFinishStart, lateFinish.lateFinishEnd);
}

bool DutyUtils::IsWoclTime(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute) {
	const auto& wocl = RuleParams::GetInstancePtr()->getWOCLDefinition();

	return TimeUtils::IsTimesCovered(startTimeUtc + offsetTZMinute * 60, endTimeUtc + offsetTZMinute * 60, wocl.woclStart, wocl.woclEnd);
}

int DutyUtils::GetWoclOverlapTime(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute) {
	const auto& wocl = RuleParams::GetInstancePtr()->getWOCLDefinition();

	return TimeUtils::GetOverlapDuration(startTimeUtc, endTimeUtc, wocl.woclStart, wocl.woclEnd, offsetTZMinute);
}

int DutyUtils::GetWoclNonOverlappingTime(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTzMinute) {
	const auto& wocl = RuleParams::GetInstancePtr()->getWOCLDefinition();

	int overLappingTime = TimeUtils::GetOverlapDuration(startTimeUtc, endTimeUtc, wocl.woclStart, wocl.woclEnd, offsetTzMinute);

	return static_cast<int>((endTimeUtc - startTimeUtc) / 60 - overLappingTime);
}

bool DutyUtils::IsNightDuty(const Duty* duty) {
	const auto& nightDuty = RuleParams::GetInstancePtr()->getNightDutyDefinition();

	int ref = duty->getRefTimeZone();

	return TimeUtils::IsAbsoluteTimesCovered(duty->getStartTimeUtcAct() + ref * 60, duty->getEndTimeUtcAct() + ref * 60, nightDuty.nightDutyStart, nightDuty.nightDutyEnd);

}

bool DutyUtils::IsNightTime(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute) {
	const auto& nightDuty = RuleParams::GetInstancePtr()->getNightDutyDefinition();

	return TimeUtils::IsTimesCovered(startTimeUtc + offsetTZMinute * 60, endTimeUtc + offsetTZMinute * 60, nightDuty.nightDutyStart, nightDuty.nightDutyEnd);
}

namespace {

// check if we can assume time zones are not changed during local night counting,
// if so, we can use a simplified logic to calculate local night time,
// otherwise we need to calculate the exact local night time by timezone info and cache the result for performance
bool shouldUseDynamicLocalNightPath(const int startOffsetTZMinute,
	const int endOffsetTZMinute,
	const std::string& zoneId);

// get the local night time window in UTC based on the day local time and local night definition, and cache the result for performance
std::vector<time_t> getDynamicLocalNightDates(time_t startTimeUtc,
	time_t endTimeUtc,
	const std::string& zoneId,
	const std::string& localNightStartHHmm,
	const std::string& localNightEndHHmm,
	const std::string& localNightMinRestIntervalHHmm);

struct LocalNightWindowUtc {
	time_t startUtc{};
	time_t endUtc{};
	bool valid{ false };
};

// helper function to format local timestamp for timezone conversion
std::string formatLocalTimestamp(time_t localTime, const char* format) {
	return TimeUtils::Format(localTime, format);
}

// The dynamic DST-aware path computes UTC boundaries per candidate local night.
// If profiling later shows these conversions are hot, we can consider:
// 1. caching zoneId -> time_zone* in TimezoneUtils
// 2. caching (zoneId, localDate, localNightStart, localNightEnd) -> UTC night window here
LocalNightWindowUtc buildLocalNightWindowUtc(time_t baseDayLoc,
	int localNightStart,
	int localNightEnd,
	const std::string& zoneId) {
	LocalNightWindowUtc result;
	if (zoneId.empty()) {
		return result;
	}

	const int secondsOfDay = 24 * 60 * 60;
	const int effectiveEndMinutes = (localNightEnd > localNightStart)
		? localNightEnd
		: localNightEnd + 24 * 60;

	const time_t nightStartLoc = baseDayLoc + static_cast<time_t>(localNightStart) * 60;
	const time_t nightEndLoc = baseDayLoc + static_cast<time_t>(effectiveEndMinutes) * 60;

	const time_t nightStartUtc = TimezoneUtils::LocalDateTimeToUtc(
		formatLocalTimestamp(nightStartLoc, "yyyy-mm-dd HH:mm:ss"), zoneId);
	const time_t nightEndUtc = TimezoneUtils::LocalDateTimeToUtc(
		formatLocalTimestamp(nightEndLoc, "yyyy-mm-dd HH:mm:ss"), zoneId);

	if (nightStartUtc == INT_MIN || nightEndUtc == INT_MIN || nightEndUtc <= nightStartUtc) {
		return result;
	}

	result.startUtc = nightStartUtc;
	result.endUtc = nightEndUtc;
	result.valid = true;
	return result;
}

bool shouldUseDynamicLocalNightPath(const int startOffsetTZMinute,
	const int endOffsetTZMinute,
	const std::string& zoneId) {
	return !zoneId.empty() && startOffsetTZMinute != endOffsetTZMinute;
}

// get the local night definition in minutes, and adjust the local night start and end time if the interval is less than the minimum rest interval
bool getAdjustedLocalNightDefinition(int& localNightStart,
	int& localNightEnd,
	int& minLocalNightMinute,
	const std::string& localNightStartHHmm,
	const std::string& localNightEndHHmm,
	const std::string& localNightMinRestIntervalHHmm) {
	localNightStart = TimeUtils::hhmmToMinutes(localNightStartHHmm);
	localNightEnd = TimeUtils::hhmmToMinutes(localNightEndHHmm);
	minLocalNightMinute = TimeUtils::hhmmToMinutes(localNightMinRestIntervalHHmm);
	if (localNightStart < 0 || localNightEnd < 0 || minLocalNightMinute <= 0) {
		return false;
	}

	const int intervalInMinutes = TimeUtils::GetDurationOfHHmm(localNightStart, localNightEnd);
	if (intervalInMinutes < minLocalNightMinute) {
		localNightStart -= (minLocalNightMinute - intervalInMinutes);
		localNightEnd += (minLocalNightMinute - intervalInMinutes);
	}
	return true;
}

time_t getRestEndTimeMeetingNumLocalNightsFixedOffset(const time_t startTimeUtc,
	const int offsetTZMinute,
	const int numLocalNights) {
	if (numLocalNights <= 0) {
		return startTimeUtc;
	}

	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();

	int localNightStart = TimeUtils::hhmmToMinutes(local_night.LocalStart);
	int localNightEnd = TimeUtils::hhmmToMinutes(local_night.LocalEnd);
	int minLocalNightMinute = TimeUtils::hhmmToMinutes(local_night.MinRestInterval);

	const int secondsOfDay = 24 * 60 * 60;

	time_t startTimeLoc = startTimeUtc + static_cast<time_t>(offsetTZMinute) * 60;
	time_t startLocalDay = TimeUtils::Floor(startTimeLoc, ChronoUnit::DAYS);

	const bool crossDay = (localNightEnd <= localNightStart);
	time_t countStartDay = startLocalDay;
	if (crossDay) {
		countStartDay -= static_cast<time_t>(secondsOfDay);
	}

	int nightsFound = 0;
	time_t lastThresholdLoc = startTimeLoc;
	const int maxIterations = numLocalNights + 2;

	for (int dayOffset = 0; dayOffset < maxIterations && nightsFound < numLocalNights; ++dayOffset) {
		const time_t baseDay = countStartDay + static_cast<time_t>(dayOffset) * secondsOfDay;
		const time_t nightStart = baseDay + static_cast<time_t>(localNightStart) * 60;
		const time_t nightEnd = crossDay
			? (baseDay + static_cast<time_t>(secondsOfDay) + static_cast<time_t>(localNightEnd) * 60)
			: (baseDay + static_cast<time_t>(localNightEnd) * 60);

		if (startTimeLoc >= nightEnd) {
			continue;
		}

		const time_t overlapStart = std::max(startTimeLoc, nightStart);
		const time_t maxOverlapSeconds = nightEnd - overlapStart;
		const time_t requiredSeconds = static_cast<time_t>(minLocalNightMinute) * 60;
		if (maxOverlapSeconds < requiredSeconds) {
			continue;
		}

		time_t threshold = overlapStart + requiredSeconds;
		if (threshold < lastThresholdLoc) {
			threshold = lastThresholdLoc;
		}

		lastThresholdLoc = threshold;
		++nightsFound;
	}

	if (nightsFound < numLocalNights) {
		return -1;
	}

	return lastThresholdLoc - static_cast<time_t>(offsetTZMinute) * 60;
}

time_t getRestEndTimeMeetingNumLocalNightsDynamic(const time_t startTimeUtc,
	const std::string& zoneId,
	const int numLocalNights) {
	if (numLocalNights <= 0) {
		return startTimeUtc;
	}
	if (startTimeUtc <= 0 || zoneId.empty()) {
		return -1;
	}

	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	int localNightStart = 0;
	int localNightEnd = 0;
	int minLocalNightMinute = 0;
	if (!getAdjustedLocalNightDefinition(localNightStart, localNightEnd, minLocalNightMinute,
		local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval)) {
		return -1;
	}

	const time_t startTimeLoc = TimezoneUtils::GetLocalTime(startTimeUtc, zoneId);
	if (startTimeLoc <= 0) {
		return -1;
	}

	const int secondsOfDay = 24 * 60 * 60;
	time_t startLocalDay = TimeUtils::Floor(startTimeLoc, ChronoUnit::DAYS);
	time_t countStartDay = startLocalDay;
	if (localNightEnd <= localNightStart) {
		countStartDay -= static_cast<time_t>(secondsOfDay);
	}

	const time_t requiredSeconds = static_cast<time_t>(minLocalNightMinute) * 60;
	time_t lastThresholdUtc = startTimeUtc;
	int nightsFound = 0;
	const int maxIterations = numLocalNights + 2;

	for (int dayOffset = 0; dayOffset < maxIterations && nightsFound < numLocalNights; ++dayOffset) {
		const time_t baseDayLoc = countStartDay + static_cast<time_t>(dayOffset) * secondsOfDay;
		const LocalNightWindowUtc window = buildLocalNightWindowUtc(baseDayLoc, localNightStart, localNightEnd, zoneId);
		if (!window.valid) {
			continue;
		}
		if (startTimeUtc >= window.endUtc) {
			continue;
		}

		const time_t overlapStartUtc = std::max(startTimeUtc, window.startUtc);
		const time_t maxOverlapSeconds = window.endUtc - overlapStartUtc;
		if (maxOverlapSeconds < requiredSeconds) {
			continue;
		}

		time_t thresholdUtc = overlapStartUtc + requiredSeconds;
		if (thresholdUtc < lastThresholdUtc) {
			thresholdUtc = lastThresholdUtc;
		}

		lastThresholdUtc = thresholdUtc;
		++nightsFound;
	}

	return nightsFound < numLocalNights ? -1 : lastThresholdUtc;
}

// dynamic or exact path to calculate local night time
std::vector<time_t> getDynamicLocalNightDates(time_t startTimeUtc,
	time_t endTimeUtc,
	const std::string& zoneId,
	const std::string& localNightStartHHmm,
	const std::string& localNightEndHHmm,
	const std::string& localNightMinRestIntervalHHmm) {
	std::vector<time_t> localNightDates;
	if (startTimeUtc <= 0 || endTimeUtc <= 0 || endTimeUtc <= startTimeUtc || zoneId.empty()) {
		return localNightDates;
	}

	int localNightStart = 0;
	int localNightEnd = 0;
	int minLocalNightMinute = 0;
	if (!getAdjustedLocalNightDefinition(localNightStart, localNightEnd, minLocalNightMinute,
		localNightStartHHmm, localNightEndHHmm, localNightMinRestIntervalHHmm)) {
		return localNightDates;
	}

	const time_t startTimeLoc = TimezoneUtils::GetLocalTime(startTimeUtc, zoneId);
	const time_t endTimeLoc = TimezoneUtils::GetLocalTime(endTimeUtc, zoneId);
	if (startTimeLoc <= 0 || endTimeLoc <= 0 || endTimeLoc <= startTimeLoc) {
		return localNightDates;
	}

	const int secondsOfDay = 24 * 60 * 60;
	time_t startLocalDay = TimeUtils::Floor(startTimeLoc, ChronoUnit::DAYS);
	time_t endLocalDay = TimeUtils::Floor(endTimeLoc, ChronoUnit::DAYS);
	time_t countStartDay = startLocalDay;
	int intervalDayNums = static_cast<int>(endLocalDay - startLocalDay) / secondsOfDay;
	if (localNightEnd <= localNightStart) {
		countStartDay -= static_cast<time_t>(secondsOfDay);
		intervalDayNums += 1;
	}

	const time_t requiredSeconds = static_cast<time_t>(minLocalNightMinute) * 60;
	for (int days = 0; days < intervalDayNums; ++days) {
		const time_t baseDayLoc = countStartDay + static_cast<time_t>(days) * secondsOfDay;
		const LocalNightWindowUtc window = buildLocalNightWindowUtc(baseDayLoc, localNightStart, localNightEnd, zoneId);
		if (!window.valid) {
			continue;
		}

		const time_t overlapStartUtc = std::max(startTimeUtc, window.startUtc);
		const time_t overlapEndUtc = std::min(endTimeUtc, window.endUtc);
		if (overlapEndUtc <= overlapStartUtc || (overlapEndUtc - overlapStartUtc) < requiredSeconds) {
			continue;
		}
		localNightDates.push_back(baseDayLoc);
	}

	return localNightDates;
}

}  // namespace

int DutyUtils::GetLocalNightNums(const time_t startTimeUtc, const time_t endTimeUtc,
	const int offsetTZMinute) {
	time_t startTimeLoc = startTimeUtc + offsetTZMinute * 60;
	time_t endTimeLoc = endTimeUtc + offsetTZMinute * 60;
	return GetLocalNightNums(startTimeLoc, endTimeLoc);
}

int DutyUtils::GetLocalNightNums(const time_t startTimeUtc, const time_t endTimeUtc,
	const int startOffsetTZMinute, const int endOffsetTZMinute, const std::string& zoneId) {
	if (!shouldUseDynamicLocalNightPath(startOffsetTZMinute, endOffsetTZMinute, zoneId)) {
		return GetLocalNightNums(startTimeUtc, endTimeUtc, startOffsetTZMinute);
	}

	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	return static_cast<int>(getDynamicLocalNightDates(startTimeUtc, endTimeUtc, zoneId,
		local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval).size());
}

int DutyUtils::GetLocalNightNums(const time_t startTimeLoc, const time_t endTimeLoc) {
	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();

	int numberOfLocalNights = GetLocalNightNums(startTimeLoc, endTimeLoc,
		local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval);
	return numberOfLocalNights;
}

int DutyUtils::GetLocalNightNumsExcludingIntervals(const time_t startTimeUtc,
	const time_t endTimeUtc,
	const int offsetTZMinute,
	const std::vector<std::pair<time_t, time_t>>& excludedIntervalsUtc) {
	if (excludedIntervalsUtc.empty()) {
		return GetLocalNightNums(startTimeUtc, endTimeUtc, offsetTZMinute);
	}
	if (startTimeUtc <= 0 || endTimeUtc <= 0 || endTimeUtc <= startTimeUtc) {
		return 0;
	}

	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	int localNightStart = TimeUtils::hhmmToMinutes(local_night.LocalStart);
	int localNightEnd = TimeUtils::hhmmToMinutes(local_night.LocalEnd);
	int intervalInMinutes = TimeUtils::GetDurationOfHHmm(localNightStart, localNightEnd);
	int minLocalNightMinute = TimeUtils::hhmmToMinutes(local_night.MinRestInterval);
	if (localNightStart < 0 || localNightEnd < 0 || minLocalNightMinute <= 0) {
		return 0;
	}

	if (intervalInMinutes < minLocalNightMinute) {
		localNightStart -= (minLocalNightMinute - intervalInMinutes);
		localNightEnd += (minLocalNightMinute - intervalInMinutes);
	}

	const time_t startTimeLoc = startTimeUtc + static_cast<time_t>(offsetTZMinute) * 60;
	const time_t endTimeLoc = endTimeUtc + static_cast<time_t>(offsetTZMinute) * 60;
	if (endTimeLoc <= startTimeLoc) {
		return 0;
	}

	const int SECONDS_OF_DAY = 24 * 60 * 60;
	const bool crossDay = (localNightEnd <= localNightStart);

	time_t startLocalDay = TimeUtils::Floor(startTimeLoc, ChronoUnit::DAYS);
	time_t endLocalDay = TimeUtils::Floor(endTimeLoc, ChronoUnit::DAYS);

	time_t countStartDay = startLocalDay;
	int intervalDayNums = static_cast<int>(endLocalDay - startLocalDay) / SECONDS_OF_DAY;
	if (crossDay) {
		countStartDay -= static_cast<time_t>(SECONDS_OF_DAY);
		intervalDayNums += 1;
	}

	const time_t requiredSeconds = static_cast<time_t>(minLocalNightMinute) * 60;
	int numberOfLocalNights = 0;

	for (int days = 0; days < intervalDayNums; ++days) {
		const time_t baseDay = countStartDay + static_cast<time_t>(days) * SECONDS_OF_DAY;
		const time_t nightStart = baseDay + static_cast<time_t>(localNightStart) * 60;
		const time_t nightEnd = crossDay
			? (baseDay + static_cast<time_t>(SECONDS_OF_DAY) + static_cast<time_t>(localNightEnd) * 60)
			: (baseDay + static_cast<time_t>(localNightEnd) * 60);

		const time_t windowStart = std::max(startTimeLoc, nightStart);
		const time_t windowEnd = std::min(endTimeLoc, nightEnd);
		if (windowEnd <= windowStart || (windowEnd - windowStart) < requiredSeconds) {
			continue;
		}

		time_t cursor = windowStart;
		time_t maxFree = 0;
		// excludedIntervalsUtc is assumed to be sorted by interval start ascending.
		for (const auto& busyUtc : excludedIntervalsUtc) {
			time_t busyStart = busyUtc.first;
			time_t busyEnd = busyUtc.second;
			if (busyStart <= 0 || busyEnd <= 0 || busyEnd <= busyStart) {
				continue;
			}
			busyStart += static_cast<time_t>(offsetTZMinute) * 60;
			busyEnd += static_cast<time_t>(offsetTZMinute) * 60;
			if (busyEnd <= windowStart) {
				continue;
			}
			if (busyStart >= windowEnd) {
				break;
			}
			const time_t bs = std::max(busyStart, windowStart);
			const time_t be = std::min(busyEnd, windowEnd);
			if (be <= bs) {
				continue;
			}
			if (bs > cursor) {
				maxFree = std::max(maxFree, bs - cursor);
			}
			cursor = std::max(cursor, be);
			if (cursor >= windowEnd) {
				break;
			}
		}
		if (cursor < windowEnd) {
			maxFree = std::max(maxFree, windowEnd - cursor);
		}
		if (maxFree >= requiredSeconds) {
			++numberOfLocalNights;
		}
	}

	return numberOfLocalNights;
}

int DutyUtils::GetLocalNightNumsExcludingIntervals(const time_t startTimeUtc,
	const time_t endTimeUtc,
	const int startOffsetTZMinute,
	const int endOffsetTZMinute,
	const std::string& zoneId,
	const std::vector<std::pair<time_t, time_t>>& excludedIntervalsUtc) {
	if (!shouldUseDynamicLocalNightPath(startOffsetTZMinute, endOffsetTZMinute, zoneId)) {
		return GetLocalNightNumsExcludingIntervals(startTimeUtc, endTimeUtc, startOffsetTZMinute, excludedIntervalsUtc);
	}
	if (excludedIntervalsUtc.empty()) {
		return GetLocalNightNums(startTimeUtc, endTimeUtc, startOffsetTZMinute, endOffsetTZMinute, zoneId);
	}
	if (startTimeUtc <= 0 || endTimeUtc <= 0 || endTimeUtc <= startTimeUtc || zoneId.empty()) {
		return 0;
	}

	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	int localNightStart = 0;
	int localNightEnd = 0;
	int minLocalNightMinute = 0;
	if (!getAdjustedLocalNightDefinition(localNightStart, localNightEnd, minLocalNightMinute,
		local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval)) {
		return 0;
	}

	const time_t startTimeLoc = TimezoneUtils::GetLocalTime(startTimeUtc, zoneId);
	const time_t endTimeLoc = TimezoneUtils::GetLocalTime(endTimeUtc, zoneId);
	if (startTimeLoc <= 0 || endTimeLoc <= 0 || endTimeLoc <= startTimeLoc) {
		return 0;
	}

	const int secondsOfDay = 24 * 60 * 60;
	time_t startLocalDay = TimeUtils::Floor(startTimeLoc, ChronoUnit::DAYS);
	time_t endLocalDay = TimeUtils::Floor(endTimeLoc, ChronoUnit::DAYS);
	time_t countStartDay = startLocalDay;
	int intervalDayNums = static_cast<int>(endLocalDay - startLocalDay) / secondsOfDay;
	if (localNightEnd <= localNightStart) {
		countStartDay -= static_cast<time_t>(secondsOfDay);
		intervalDayNums += 1;
	}

	const time_t requiredSeconds = static_cast<time_t>(minLocalNightMinute) * 60;

	int numberOfLocalNights = 0;
	for (int days = 0; days < intervalDayNums; ++days) {
		const time_t baseDayLoc = countStartDay + static_cast<time_t>(days) * secondsOfDay;
		const LocalNightWindowUtc window = buildLocalNightWindowUtc(baseDayLoc, localNightStart, localNightEnd, zoneId);
		if (!window.valid) {
			continue;
		}

		const time_t windowStart = std::max(startTimeUtc, window.startUtc);
		const time_t windowEnd = std::min(endTimeUtc, window.endUtc);
		if (windowEnd <= windowStart || (windowEnd - windowStart) < requiredSeconds) {
			continue;
		}

		time_t cursor = windowStart;
		time_t maxFree = 0;
		// excludedIntervalsUtc is assumed to be sorted by interval start ascending.
		for (const auto& busyUtc : excludedIntervalsUtc) {
			const time_t busyStart = busyUtc.first;
			const time_t busyEnd = busyUtc.second;
			if (busyStart <= 0 || busyEnd <= 0 || busyEnd <= busyStart) {
				continue;
			}
			if (busyEnd <= windowStart) {
				continue;
			}
			if (busyStart >= windowEnd) {
				break;
			}
			const time_t bs = std::max(busyStart, windowStart);
			const time_t be = std::min(busyEnd, windowEnd);
			if (be <= bs) {
				continue;
			}
			if (bs > cursor) {
				maxFree = std::max(maxFree, bs - cursor);
			}
			cursor = std::max(cursor, be);
			if (cursor >= windowEnd) {
				break;
			}
		}
		if (cursor < windowEnd) {
			maxFree = std::max(maxFree, windowEnd - cursor);
		}
		if (maxFree >= requiredSeconds) {
			++numberOfLocalNights;
		}
	}

	return numberOfLocalNights;
}

int DutyUtils::GetLocalNightNums(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute,
	const std::string& localNightStartHHmm, const std::string& localNightEndHHmm, const std::string& localNightMinRestIntervalHHmm) {
	time_t startTimeLoc = startTimeUtc + offsetTZMinute * 60;
	time_t endTimeLoc = endTimeUtc + offsetTZMinute * 60;
	return GetLocalNightNums(startTimeLoc, endTimeLoc, localNightStartHHmm, localNightEndHHmm, localNightMinRestIntervalHHmm);
}

int DutyUtils::GetLocalNightNums(const time_t startTimeLoc, const time_t endTimeLoc,
	const std::string& localNightStartHHmm, const std::string& localNightEndHHmm, const std::string& localNightMinRestIntervalHHmm) {
	int localNightStart = TimeUtils::hhmmToMinutes(localNightStartHHmm);
	int localNightEnd = TimeUtils::hhmmToMinutes(localNightEndHHmm);
	int minLocalNightMinute = TimeUtils::hhmmToMinutes(localNightMinRestIntervalHHmm);
	return DutyUtils::GetLocalNightNums(startTimeLoc, endTimeLoc, localNightStart, localNightEnd, minLocalNightMinute);
}

int DutyUtils::GetLocalNightNums(const time_t startTimeLoc, const time_t endTimeLoc,
	const int localNightStartHHmm, const int localNightEndHHmm, const int localNightMinRestIntervalHHmm) {
	int numberOfLocalNights = 0;

	int localNightStart = localNightStartHHmm;
	int localNightEnd = localNightEndHHmm;
	int intervalInMinutes = TimeUtils::GetDurationOfHHmm(localNightStart, localNightEnd);
	int minLocalNightMinute = localNightMinRestIntervalHHmm;

	if (intervalInMinutes < minLocalNightMinute) {
		localNightStart -= (minLocalNightMinute - intervalInMinutes);
		localNightEnd += (minLocalNightMinute - intervalInMinutes);
	}

	//开始日期（本地时间：天）
	time_t startLocalDay = TimeUtils::Floor(startTimeLoc, ChronoUnit::DAYS);
	//结束日期（本地时间：天）
	time_t endLocalDay = TimeUtils::Floor(endTimeLoc, ChronoUnit::DAYS);

	const int SECONDS_OF_DAY = 24 * 60 * 60; //每天秒数

	// 计算循环起始日和天数。
	// 对于跨天的本地夜晚（例如 22:00-08:00），需要从 startLocalDay 前一天开始统计，
	// 这样可以覆盖“前一晚 22:00-当日 08:00”这种情况（例如休息 00:00-08:00）。
	time_t countStartDay = startLocalDay;
	int intervalDayNums = static_cast<int>(endLocalDay - startLocalDay) / SECONDS_OF_DAY; //间隔天数
	if (localNightEnd <= localNightStart) {
		countStartDay -= (time_t)SECONDS_OF_DAY;
		intervalDayNums += 1;
	}

	time_t currDayLocalNightLower = 0;
	time_t currDayLocalNightUpper = 0;

	for (int days = 0; days < intervalDayNums; days++) {
		time_t baseDay = countStartDay + (time_t)days * SECONDS_OF_DAY;
		currDayLocalNightLower = baseDay + (time_t)localNightStart * 60;
		if (localNightEnd > localNightStart) {
			currDayLocalNightUpper = baseDay + (time_t)localNightEnd * 60;
		}
		else {
			//跨天
			currDayLocalNightUpper = baseDay + (time_t)SECONDS_OF_DAY + (time_t)localNightEnd * 60;
		}
		if (TimeUtils::IsAbsoluteTimesCovered(startTimeLoc, endTimeLoc, currDayLocalNightLower, currDayLocalNightUpper)) {
			time_t startTime = std::max(startTimeLoc, currDayLocalNightLower);
			time_t endTime = std::min(endTimeLoc, currDayLocalNightUpper);
			int diffMins = (endTime - startTime) / 60;
			if (diffMins >= minLocalNightMinute) {
				numberOfLocalNights++;
			}
		}
	}
	return numberOfLocalNights;
}

std::vector<time_t> DutyUtils::GetLocalNightDates(const time_t startTimeUtc, const time_t endTimeUtc,
	const int offsetTZMinute) {
	time_t startTimeLoc = startTimeUtc + offsetTZMinute * 60;
	time_t endTimeLoc = endTimeUtc + offsetTZMinute * 60;
	return GetLocalNightDates(startTimeLoc, endTimeLoc);
}

std::vector<time_t> DutyUtils::GetLocalNightDates(const time_t startTimeUtc, const time_t endTimeUtc,
	const int startOffsetTZMinute, const int endOffsetTZMinute, const std::string& zoneId) {
	if (!shouldUseDynamicLocalNightPath(startOffsetTZMinute, endOffsetTZMinute, zoneId)) {
		return GetLocalNightDates(startTimeUtc, endTimeUtc, startOffsetTZMinute);
	}

	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	return getDynamicLocalNightDates(startTimeUtc, endTimeUtc, zoneId,
		local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval);
}

std::vector<time_t> DutyUtils::GetLocalNightDates(const time_t startTimeLoc, const time_t endTimeLoc) {
	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();

	std::vector<time_t> localNightDates = GetLocalNightDates(startTimeLoc, endTimeLoc,
		local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval);
	return localNightDates;
}

std::vector<time_t> DutyUtils::GetLocalNightDates(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute,
	const std::string& localNightStartHHmm, const std::string& localNightEndHHmm, const std::string& localNightMinRestIntervalHHmm) {
	time_t startTimeLoc = startTimeUtc + offsetTZMinute * 60;
	time_t endTimeLoc = endTimeUtc + offsetTZMinute * 60;
	return GetLocalNightDates(startTimeLoc, endTimeLoc, localNightStartHHmm, localNightEndHHmm, localNightMinRestIntervalHHmm);
}

std::vector<time_t> DutyUtils::GetLocalNightDates(const time_t startTimeLoc, const time_t endTimeLoc,
	const std::string& localNightStartHHmm, const std::string& localNightEndHHmm, const std::string& localNightMinRestIntervalHHmm) {

	std::vector<time_t> localNightDates;

	int localNightStart = TimeUtils::hhmmToMinutes(localNightStartHHmm);
	int localNightEnd = TimeUtils::hhmmToMinutes(localNightEndHHmm);
	int intervalInMinutes = TimeUtils::GetDurationOfHHmm(localNightStart, localNightEnd);
	int minLocalNightMinute = TimeUtils::hhmmToMinutes(localNightMinRestIntervalHHmm);

	if (intervalInMinutes < minLocalNightMinute) {
		localNightStart -= (minLocalNightMinute - intervalInMinutes);
		localNightEnd += (minLocalNightMinute - intervalInMinutes);
	}

	//开始日期（本地时间：天）
	time_t startLocalDay = TimeUtils::Floor(startTimeLoc, ChronoUnit::DAYS);
	//结束日期（本地时间：天）
	time_t endLocalDay = TimeUtils::Floor(endTimeLoc, ChronoUnit::DAYS);

	const int SECONDS_OF_DAY = 24 * 60 * 60; //每天秒数

	// 计算循环起始日和天数。
	// 对于跨天的本地夜晚（例如 22:00-08:00），需要从 startLocalDay 前一天开始统计，
	// 这样可以覆盖“前一晚 22:00-当日 08:00”这种情况（例如休息 00:00-08:00）。
	time_t countStartDay = startLocalDay;
	int intervalDayNums = static_cast<int>(endLocalDay - startLocalDay) / SECONDS_OF_DAY; //间隔天数
	if (localNightEnd <= localNightStart) {
		countStartDay -= (time_t)SECONDS_OF_DAY;
		intervalDayNums += 1;
	}

	time_t currDayLocalNightLower = 0;
	time_t currDayLocalNightUpper = 0;

	for (int days = 0; days < intervalDayNums; days++) {
		time_t baseDay = countStartDay + (time_t)days * SECONDS_OF_DAY;
		currDayLocalNightLower = baseDay + (time_t)localNightStart * 60;
		if (localNightEnd > localNightStart) {
			currDayLocalNightUpper = baseDay + (time_t)localNightEnd * 60;
		}
		else {
			//跨天
			currDayLocalNightUpper = baseDay + (time_t)SECONDS_OF_DAY + (time_t)localNightEnd * 60;
		}
		if (TimeUtils::IsAbsoluteTimesCovered(startTimeLoc, endTimeLoc, currDayLocalNightLower, currDayLocalNightUpper)) {
			time_t startTime = std::max(startTimeLoc, currDayLocalNightLower);
			time_t endTime = std::min(endTimeLoc, currDayLocalNightUpper);
			int diffMins = (endTime - startTime) / 60;
			if (diffMins >= minLocalNightMinute) {
				localNightDates.push_back(baseDay);
			}
		}
	}
	return localNightDates;
}

int DutyUtils::GetLocalNightEnd() {
	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	const auto& local_night_end = local_night.LocalEnd;
	return TimeUtils::hhmmToMinutes(local_night_end);
}

DutyUtils::LocalNightUtcWindow DutyUtils::GetLocalNightWindowUtc(time_t dateKeyLoc,
                                                                 int offsetTZMinute,
                                                                 const std::string& zoneId) {
	LocalNightUtcWindow result;
	Local_Night_Definition& localNight = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	int localNightStart = 0;
	int localNightEnd = 0;
	int minLocalNightMinute = 0;
	if (!getAdjustedLocalNightDefinition(localNightStart, localNightEnd, minLocalNightMinute, localNight.LocalStart,
	                                     localNight.LocalEnd, localNight.MinRestInterval)) {
		return result;
	}

	if (!zoneId.empty()) {
		const LocalNightWindowUtc window =
		    buildLocalNightWindowUtc(dateKeyLoc, localNightStart, localNightEnd, zoneId);
		result.startUtc = window.startUtc;
		result.endUtc = window.endUtc;
		result.valid = window.valid;
		return result;
	}

	const int secondsOfDay = 24 * 60 * 60;
	const bool crossDay = localNightEnd <= localNightStart;
	const time_t nightStartLoc = dateKeyLoc + static_cast<time_t>(localNightStart) * 60;
	const time_t nightEndLoc =
	    crossDay ? dateKeyLoc + secondsOfDay + static_cast<time_t>(localNightEnd) * 60
	             : dateKeyLoc + static_cast<time_t>(localNightEnd) * 60;
	result.startUtc = nightStartLoc - static_cast<time_t>(offsetTZMinute) * 60;
	result.endUtc = nightEndLoc - static_cast<time_t>(offsetTZMinute) * 60;
	result.valid = result.endUtc > result.startUtc;
	return result;
}

time_t DutyUtils::GetRestEndTimeMeetingMinRestAndNumLocalNights(time_t startTimeUtc,
	int startOffsetTZMinute,
	const std::string& zoneId,
	int minRestMinutes,
	int numLocalNights) {
	auto restEndUtcDueToRestTime = startTimeUtc;
	if (minRestMinutes > 0)
		restEndUtcDueToRestTime = startTimeUtc + (time_t)minRestMinutes * 60;

	auto restEndUtcDueToLocalNights = startTimeUtc;
	if (numLocalNights > 0)
		restEndUtcDueToLocalNights = GetRestEndTimeMeetingNumLocalNights(startTimeUtc, startOffsetTZMinute, zoneId, numLocalNights);

	return std::max(restEndUtcDueToRestTime, restEndUtcDueToLocalNights);
}

//TODO, we can optimize this function later, instead of linear counting, get first local night , then compute rest local nights directly.
//TODO, Local_Night_Definition members are string, we can convert them to int members to avoid repeated conversion.
time_t DutyUtils::GetRestEndTimeMeetingNumLocalNights(time_t startTimeUtc,
	int startOffsetTZMinute,
	const std::string& zoneId,
	int numLocalNights) {
	const time_t fixedOffsetResult =
		getRestEndTimeMeetingNumLocalNightsFixedOffset(startTimeUtc, startOffsetTZMinute, numLocalNights);
	if (fixedOffsetResult <= 0 || zoneId.empty()) {
		return fixedOffsetResult;
	}

	const int endOffsetTZMinute = TimezoneUtils::GetTimezoneOffset(fixedOffsetResult, zoneId);
	if (endOffsetTZMinute == startOffsetTZMinute) {
		return fixedOffsetResult;
	}

	return getRestEndTimeMeetingNumLocalNightsDynamic(startTimeUtc, zoneId, numLocalNights);
#if 0
	// lastThresholdLoc是在本地时间下，满足已找到的本地夜晚要求的最早结束时间
	time_t lastThresholdLoc = startTimeLoc;

	// 允许略微跳过因开始时间过晚而无法满足本地夜晚要求的首日窗口
	int maxIterations = numLocalNights + 2;

	for (int dayOffset = 0; dayOffset < maxIterations && nightsFound < numLocalNights; ++dayOffset) {
		time_t baseDay = countStartDay + (time_t)dayOffset * SECONDS_OF_DAY;
		time_t nightStart = baseDay + (time_t)localNightStart * 60;
		time_t nightEnd = 0;
		if (!crossDay) {
			nightEnd = baseDay + (time_t)localNightEnd * 60;
		}
		else {
			nightEnd = baseDay + (time_t)SECONDS_OF_DAY + (time_t)localNightEnd * 60;
		}

		// 若休息开始时间在该本地夜晚结束之后，则该晚无法满足要求
		if (startTimeLoc >= nightEnd) {
			continue;
		}

		time_t overlapStart = std::max(startTimeLoc, nightStart);
		time_t maxOverlapSeconds = nightEnd - overlapStart;
		time_t requiredSeconds = (time_t)minLocalNightMinute * 60;

		if (maxOverlapSeconds < requiredSeconds) {
			// 无论如何延长结束时间，该晚都无法积累足够的本地夜晚时长
			continue;
		}

		time_t threshold = overlapStart + requiredSeconds;

		if (threshold < lastThresholdLoc) {
			threshold = lastThresholdLoc;
		}

		lastThresholdLoc = threshold;
		++nightsFound;
	}

	if (nightsFound < numLocalNights) {
		return -1;
	}

	// 转回UTC时间
	return lastThresholdLoc - (time_t)offsetTZMinute * 60;
#endif
}

time_t DutyUtils::GetRestEndTimeMeetingLocalNight(const time_t startTimeUtc, const time_t endTimeUtc,
	const int offsetTZMinute) {
	time_t startTimeLoc = startTimeUtc + offsetTZMinute * 60;
	time_t endTimeLoc = endTimeUtc + offsetTZMinute * 60;
	time_t restEndTimeMeetingLocalNightLoc = GetRestEndTimeMeetingLocalNight(startTimeLoc, endTimeLoc);
	if (restEndTimeMeetingLocalNightLoc < 0) {
		return restEndTimeMeetingLocalNightLoc;
	}
	//返回UTC时间
	return restEndTimeMeetingLocalNightLoc - (time_t)offsetTZMinute * 60;
}

time_t DutyUtils::GetRestEndTimeMeetingLocalNight(const time_t startTimeLoc, const time_t endTimeLoc) {
	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();

	time_t restEndTime = GetRestEndTimeMeetingLocalNight(startTimeLoc, endTimeLoc,
		local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval);
	return restEndTime;
}


time_t DutyUtils::GetRestEndTimeMeetingLocalNight(const time_t startTimeLoc, const time_t endTimeLoc,
	const std::string& localNightStartHHmm, const std::string& localNightEndHHmm, const std::string& localNightMinRestIntervalHHmm) {

	int localNightStart = TimeUtils::hhmmToMinutes(localNightStartHHmm);
	int localNightEnd = TimeUtils::hhmmToMinutes(localNightEndHHmm);
	int intervalInMinutes = TimeUtils::GetDurationOfHHmm(localNightStart, localNightEnd);
	int minLocalNightMinute = TimeUtils::hhmmToMinutes(localNightMinRestIntervalHHmm);

	//开始日期（本地时间：天）
	time_t startLocalDay = TimeUtils::Floor(startTimeLoc, ChronoUnit::DAYS);
	//结束日期（本地时间：天）
	time_t endLocalDay = TimeUtils::Floor(endTimeLoc, ChronoUnit::DAYS);

	const int SECONDS_OF_DAY = 24 * 60 * 60; //每天秒数

	time_t currDayLocalNightLower = 0;
	time_t currDayLocalNightUpper = 0;

	//仅需要满足第一个本地夜晚即可，因此只需要笔记第一天即可
	currDayLocalNightLower = startLocalDay + (time_t)localNightStart * 60;
	if (localNightEnd > localNightStart) {
		currDayLocalNightUpper = startLocalDay + (time_t)localNightEnd * 60;
	}
	else {
		//跨天
		currDayLocalNightUpper = startLocalDay + (time_t)SECONDS_OF_DAY + (time_t)localNightEnd * 60;
	}

	if (intervalInMinutes <= minLocalNightMinute) {
		//[currDayLocalNightLower,currDayLocalNightUpper] 必须在 [startTimeLoc, endTimeLoc+ extendMinutes] 内部
		if (startTimeLoc > currDayLocalNightLower) {
			//无论如何扩展结束时间都不可能满足第一天的本地夜晚要求
			return -1;
		}

		//返回本地时间
		time_t restEndTimeMeetingLocalNight = startTimeLoc + (time_t)minLocalNightMinute * 60;
		if (restEndTimeMeetingLocalNight < currDayLocalNightUpper) {
			return currDayLocalNightUpper;
		}
		return restEndTimeMeetingLocalNight;
	}
	else {
		if (startTimeLoc > (currDayLocalNightUpper - (time_t)minLocalNightMinute*60)) {
			//无论如何扩展结束时间都不可能满足第一天的本地夜晚要求
			return -1;
		}

		//返回本地时间
		time_t restEndTimeMeetingLocalNight = startTimeLoc + (time_t)minLocalNightMinute * 60;
		if (restEndTimeMeetingLocalNight < (currDayLocalNightLower + (time_t)minLocalNightMinute * 60)) {
			return (currDayLocalNightLower + (time_t)minLocalNightMinute * 60);
		}
		return restEndTimeMeetingLocalNight;
	}
	return -1;
}


int DutyUtils::GetConsecutiveWOCLNums(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute) {
	time_t startTimeLoc = startTimeUtc + offsetTZMinute * 60;
	time_t endTimeLoc = endTimeUtc + offsetTZMinute * 60;
	return GetConsecutiveWOCLNums(startTimeLoc, endTimeLoc);
}

int DutyUtils::GetConsecutiveWOCLNums(const time_t startTimeLoc, const time_t endTimeLoc) {
	WOCL_Definition& wocl = RuleParams::GetInstancePtr()->getWOCLDefinition();

	int numberOfLocalNights = GetConsecutiveTimePeriodNums(startTimeLoc, endTimeLoc, wocl.woclStart, wocl.woclEnd);
	return numberOfLocalNights;
}

int DutyUtils::GetConsecutiveTimePeriodNums(const time_t startTime, const time_t endTime, const int periodStartHHmm, const int periodEndHHmm, const int minIntervalHHmmInPeriod) {
	//核心代码：与GetLocalNightNums()相同

	int numberOfLocalNights = 0;

	int localNightStart = periodStartHHmm;
	int localNightEnd = periodEndHHmm;
	int intervalInMinutes = TimeUtils::GetDurationOfHHmm(localNightStart, localNightEnd);

	int minLocalNightMinute = minIntervalHHmmInPeriod > 0 ? minIntervalHHmmInPeriod : intervalInMinutes;

	/*算法思路：首先转化成 本地时间段 [startTimeLoc, endTimeLoc]，该时间段中间每天（不包含第一天和最后一天）必然满足本地夜晚
	  因此 "本地夜晚天数" = IF("第一天满足本地夜晚", 1, 0) + IF("最后一天满足本地夜晚", 1, 0) + "中间天数"
	  备注：IF(条件，条件为true返回，条件为false返回)
	  备注：第一天 和 最后一天 是同一天 不能在累加
	*/

	//步骤1：获得开始计算第一天startLocalDay，以及结束最后一天（结束日期）endLocalDay
	//开始日期（本地时间：天）
	time_t startLocalDay = TimeUtils::Floor(startTime, ChronoUnit::DAYS);
	//结束日期（本地时间：天）
	time_t endLocalDay = TimeUtils::Floor(endTime, ChronoUnit::DAYS);

	time_t firstDayLocalNightLower = -1;
	time_t firstDayLocalNightUpper = -1;
	time_t lastDayLocalNightLower = -1;
	time_t lastDayLocalNightUpper = -1;

	if (intervalInMinutes < minLocalNightMinute) {
		//步骤2：获得第一天满足本地夜晚开始下限值firstDayLocalNightLower、结束上限firstDayLocalNightUpper
		firstDayLocalNightLower = startLocalDay +
			((localNightStart + intervalInMinutes) - minLocalNightMinute) * 60;
		firstDayLocalNightUpper = firstDayLocalNightLower + minLocalNightMinute * 60;

		//步骤3：获得最后一天满足本地夜晚上限值lastDayLocalNightUpper、下限值lastDayLocalNightLower
		lastDayLocalNightLower = endLocalDay + localNightStart * 60;
		lastDayLocalNightUpper = lastDayLocalNightLower + minLocalNightMinute * 60;
	}
	else {
		//步骤2：获得第一天满足本地夜晚开始下限值firstDayLocalNightLower、结束上限firstDayLocalNightUpper
		firstDayLocalNightLower = startLocalDay + localNightStart * 60;
		firstDayLocalNightUpper = firstDayLocalNightLower + minLocalNightMinute * 60;

		//步骤3：获得最后一天满足本地夜晚上限值lastDayLocalNightUpper、下限值lastDayLocalNightLower
		lastDayLocalNightLower = endLocalDay + localNightStart * 60;
		lastDayLocalNightUpper = lastDayLocalNightLower + minLocalNightMinute * 60;
	}


	//第一天和最后一天处理，注意可能是同一天特殊处理。
	bool matchFirstDay = false;
	if (startTime <= firstDayLocalNightLower && endTime >= firstDayLocalNightUpper) {
		matchFirstDay = true;
		numberOfLocalNights++;
	}
	bool matchLastDay = false;
	if (startTime <= lastDayLocalNightLower && endTime >= lastDayLocalNightUpper) {
		matchLastDay = true;
		numberOfLocalNights++;
	}
	//针对首尾是同一天，并且都匹配到规则，则减去重复计算多出1天。
	if (matchLastDay && matchFirstDay && (startLocalDay == endLocalDay)) {
		numberOfLocalNights--;
	}

	int secondsOfDay = 24 * 60 * 60; //每天秒数
	int intervalDayNums = static_cast<int>(endLocalDay - startLocalDay) / secondsOfDay - 1;
	numberOfLocalNights += (intervalDayNums < 0 ? 0 : intervalDayNums);
	return numberOfLocalNights;
}

int DutyUtils::GetActualRestMinutes(time_t& actRestStartTimeUtc, const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData) {
	time_t actRestEndTimeUtc = 0;
	return GetActualRestMinutes(actRestStartTimeUtc, actRestEndTimeUtc, currDuty, nextDuty, dbData);
}

int DutyUtils::GetActualRestMinutes(time_t& actRestStartTimeUtc, time_t& actRestEndTimeUtc, const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData) {

	if (nextDuty == nullptr) {
		int dropoff = currDuty->getActualDropoffMin();
		if (dropoff <= 0)
			dropoff = currDuty->getMinDropoff();
		actRestStartTimeUtc = currDuty->getEndTimeUtcAct() + dropoff * 60;
		return currDuty->getMinRest();
	}

	string isRound = "N";
	auto it = dbData->systemParamMap.find("CALC_REST_ROUND");
	if (it != dbData->systemParamMap.end()) {
		isRound = it->second;
	}

	//if (duties[i]->getPairingId() == 27051395)
	//	printf("");
	int pickup = nextDuty->getActualPickupMin();
	int dropoff = currDuty->getActualDropoffMin();
	if (pickup <= 0)
		pickup = nextDuty->getMinPickup();
	if (dropoff <= 0)
		dropoff = currDuty->getMinDropoff();

	time_t restStart = currDuty->getEndTimeUtcAct();
	time_t restEnd = nextDuty->getStartTimeUtcAct();
	//cout << utcToUtcString(restStart) << endl;
	//cout << utcToUtcString(restEnd) << endl;
	if (isRound == "Y")
	{
		restStart = Utility::GetInstancePtr()->getTimeByRoundHour(restStart, true);
		restEnd = Utility::GetInstancePtr()->getTimeByRoundHour(restEnd, false);
	}

	int actRest = static_cast<int>(restEnd - restStart) / 60;

	actRest -= (dropoff + pickup);
	actRestStartTimeUtc = restStart + dropoff * 60;
	actRestEndTimeUtc = restEnd - pickup * 60;
	return actRest;
}

int DutyUtils::GetActualRestMinutes(const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData) {
	time_t actRestStartTimeUtc = 0;
	return GetActualRestMinutes(actRestStartTimeUtc, currDuty, nextDuty, dbData);
}

int DutyUtils::GetActualRestMinutes(time_t& actRestStartTimeUtc, const Duty* currDuty, const ROSTER* nextRoster, const SharedPtr<CrewDataContext>& dbData) {
	if (nextRoster == nullptr) {
		return currDuty->getMinRest();
	}

	string isRound = "N";
	auto it = dbData->systemParamMap.find("CALC_REST_ROUND");
	if (it != dbData->systemParamMap.end()) {
		isRound = it->second;
	}

	int dropoff = currDuty->getActualDropoffMin();
	if (dropoff <= 0)
		dropoff = currDuty->getMinDropoff();

	time_t restStart = currDuty->getEndTimeUtcAct();
	time_t restEnd = nextRoster->getStartTimeUtcAct();
	//cout << utcToUtcString(restStart) << endl;
	//cout << utcToUtcString(restEnd) << endl;
	if (isRound == "Y")
	{
		restStart = Utility::GetInstancePtr()->getTimeByRoundHour(restStart, true);
		restEnd = Utility::GetInstancePtr()->getTimeByRoundHour(restEnd, false);
	}

	int actRest = static_cast<int>(restEnd - restStart) / 60;

	actRest -= (dropoff);
	actRestStartTimeUtc = restStart + dropoff;
	return actRest;
}

int DutyUtils::GetActualRestMinutes(const Duty* currDuty, const ROSTER* nextRoster, const SharedPtr<CrewDataContext>& dbData) {
	time_t actRestStartTimeUtc = 0;
	return GetActualRestMinutes(actRestStartTimeUtc, currDuty, nextRoster, dbData);
}

long DutyUtils::GetDutyFDPInMinsWithTruncation(Duty* duty, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData) {
	if (!duty) {
		return 0;
	}

	long fdp = 0;
	const vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes = duty->pairingDutyNodes;
	bool nowSegIsHasNode = false;
	vector<Segment*> Segments = duty->getSegments();
	bool hasFDP = false;
	const bool useStickTime = RuleParams::GetInstancePtr()->bUseStickTime;
	const long minConnectionTimeSeconds = static_cast<long>(RuleParams::GetInstancePtr()->minConnectionTimeMinutes * 60);

	auto getStickDurationSeconds = [](Segment* seg) -> long {
		const long blkSeconds = seg->getBlkSeconds() > 0 ? seg->getBlkSeconds() : static_cast<long>(seg->getEndTimeUtcAct() - seg->getStartTimeUtcAct());
		return std::max<long>(0, blkSeconds);
	};

	auto getAssumedArrivalUtc = [&](Segment* seg) -> time_t {
		if (useStickTime) {
			time_t stdUtc = seg->getStartTimeUtcAct();
			return stdUtc + getStickDurationSeconds(seg);
		}
		return seg->getEndTimeUtcAct();
	};

	//检查是否包含FDP > 0 段
	for (std::size_t i = 0; i < Segments.size(); i++) {
		map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());
		if (segAssignment != dbData->assignmentNameMap.end() && segAssignment->second != nullptr && segAssignment->second->FDP_PCT > 0) {
			hasFDP = true;
			break;
		}
	}
	if (!hasFDP) {
		return 0;
	}
	//if (Segments[0]->getDBId() == 50438827) {
	//	cout <<  "";
	//}
	//计算Duty级dutyNode
	for (std::size_t i = 0; i < pairingDutyNodes.size(); i++) {
		if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "BRIEF" && RuleParams::GetInstancePtr()->bIncludeCI) {
			long tmpFDP = static_cast<long>(std::min(pairingDutyNodes[i]->getEndUtc(), upperLimitTimeUtc) - std::max(pairingDutyNodes[i]->getStartUtc(), lowerLimitTimeUtc));
			fdp += (tmpFDP > 0 ? tmpFDP : 0);
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "DEBRIEF" && RuleParams::GetInstancePtr()->bIncludeCO) {
			long tmpFDP = static_cast<long>(std::min(pairingDutyNodes[i]->getEndUtc(), upperLimitTimeUtc) - std::max(pairingDutyNodes[i]->getStartUtc(), lowerLimitTimeUtc));
			fdp += (tmpFDP > 0 ? tmpFDP : 0);
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "DROPOFF" && RuleParams::GetInstancePtr()->bDropoffCount) {
			long tmpFDP = static_cast<long>(std::min(pairingDutyNodes[i]->getEndUtc(), upperLimitTimeUtc) - std::max(pairingDutyNodes[i]->getStartUtc(), lowerLimitTimeUtc));
			fdp += (tmpFDP > 0 ? tmpFDP : 0);
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "PICKUP" && RuleParams::GetInstancePtr()->bPickupCount) {
			long tmpFDP = static_cast<long>(std::min(pairingDutyNodes[i]->getEndUtc(), upperLimitTimeUtc) - std::max(pairingDutyNodes[i]->getStartUtc(), lowerLimitTimeUtc));
			fdp += (tmpFDP > 0 ? tmpFDP : 0);
		}
	}
	bool isLT2ndDHD = false;
	if (RuleParams::GetInstancePtr()->bIncludeLastDHD == false) {
		bool transitStart = false;
		isLT2ndDHD = true;
		for (int s = 0; s < (int)Segments.size() - 1; s++) {
			auto seg = Segments[s];
			auto nextseg = Segments[s + 1];
			if (transitStart == false) {
				long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(seg, nextseg);
				if (longTransit)
					transitStart = true;
			}

			if (transitStart) {
				if (nextseg->getIsOperating()) {
					isLT2ndDHD = false;
					break;
				}
			}
		}
		if (transitStart == false)
			isLT2ndDHD = false;
	}

	long longTransitStart = 0;
	long longTransitEnd = 0;
	//20210725 ain, mantis#9399, fdp统计 seg层级 node增加 type=SEGMENT判断
	//计算Seg级 DutyNode
	for (std::size_t j = 0; j < pairingDutyNodes.size(); j++) {
		if (pairingDutyNodes[j]->getType() != "SEGMENT") {
			continue;
		}
		if (isLT2ndDHD)
			continue;
		bool nodeMatchSeg = false;
		for (std::size_t i = 0; i < Segments.size(); i++) {
			if (Segments[i]->getSegmentId() == pairingDutyNodes[j]->getToSegmentId())
				nodeMatchSeg = true;
		}
		if (nodeMatchSeg) {
			nowSegIsHasNode = true;
			if (pairingDutyNodes[j]->getNode() == "BRIEF" && RuleParams::GetInstancePtr()->bIncludeLongTransitCI) {
				long tmpFDP = static_cast<long>(std::min(pairingDutyNodes[j]->getEndUtc(), upperLimitTimeUtc) - std::max(pairingDutyNodes[j]->getStartUtc(), lowerLimitTimeUtc));
				fdp += (tmpFDP > 0 ? tmpFDP : 0);
			}
			else if (pairingDutyNodes[j]->getNode() == "DEBRIEF" && RuleParams::GetInstancePtr()->bIncludeLongTransitCO) {
				long tmpFDP = static_cast<long>(std::min(pairingDutyNodes[j]->getEndUtc(), upperLimitTimeUtc) - std::max(pairingDutyNodes[j]->getStartUtc(), lowerLimitTimeUtc));
				fdp += (tmpFDP > 0 ? tmpFDP : 0);
			}
			else if (pairingDutyNodes[j]->getNode() == "DROPOFF" && RuleParams::GetInstancePtr()->bDropoffCount) {
				long tmpFDP = static_cast<long>(std::min(pairingDutyNodes[j]->getEndUtc(), upperLimitTimeUtc) - std::max(pairingDutyNodes[j]->getStartUtc(), lowerLimitTimeUtc));
				fdp += (tmpFDP > 0 ? tmpFDP : 0);
			}
			else if (pairingDutyNodes[j]->getNode() == "PICKUP" && RuleParams::GetInstancePtr()->bPickupCount) {
				long tmpFDP = static_cast<long>(std::min(pairingDutyNodes[j]->getEndUtc(), upperLimitTimeUtc) - std::max(pairingDutyNodes[j]->getStartUtc(), lowerLimitTimeUtc));
				fdp += (tmpFDP > 0 ? tmpFDP : 0);
			}

			///TEST
			//if (duty->getNumSegments() > 0 && duty->getSegment(0)->getDBId() == 61840835) {
			//	cout << "**DBG CustomBiz calculateDutyFdp fdp=" << fdp
			//		<< " seg.dutyNode=" << pairingDutyNodes[j]->getType()
			//		<< " toSegmentId=" << pairingDutyNodes[j]->getToSegmentId()
			//		<< " " << utcToUtcString(pairingDutyNodes[j]->getStartUtc())
			//		<< " " << utcToUtcString(pairingDutyNodes[j]->getEndUtc())
			//		<< endl;
			//}
		}
	}

	//遍历Seg
	for (int i = 0; i < (int)Segments.size(); i++) {
		bool preSeg = false, nowSeg = false;
		if (i > 0) {
			map<string, SharedPtr<ASSIGNMENT>>::iterator sAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());
			if ((sAssignment != dbData->assignmentNameMap.end() && sAssignment->second->FDP_PCT > 0)
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bPreFerryCount && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bIncludeLastDHD && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePreSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePreGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePreStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePreHSB && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePostHSB && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))) {
				nowSeg = true;
			}
			sAssignment = dbData->assignmentNameMap.find(Segments[i - 1]->getAssignment());
			if ((sAssignment != dbData->assignmentNameMap.end() && sAssignment->second->FDP_PCT > 0)
				|| (dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bPreFerryCount)
				//|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bIncludeLastDHD && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePreSBY)
				//|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePreGround)
				//|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePreStay)
				//|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePreHSB)
				//|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePostHSB && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				) {
				preSeg = true;
			}
		}
		//尝试在 seg[i-1]和 seg[i]之间寻找 brief、debrief，用于后续判断是否应将seg间距加入FDP
		shared_ptr<PairingDutyNode> briefBetweenSeg;
		shared_ptr<PairingDutyNode> debriefBetweenSeg;
		if (i > 0) {
			for (auto& node : pairingDutyNodes) {
				if (node->getType() != "SEGMENT") {
					continue;
				}
				if (node->getNode() == "BRIEF" && node->getToSegmentId() == Segments[i]->getSegmentId()) {
					briefBetweenSeg = node;
				}
				if (node->getNode() == "DEBRIEF" && node->getFromSegmentId() == Segments[i - 1]->getSegmentId()) {
					debriefBetweenSeg = node;
				}
			}
		}
		//SEG之间的计算
		//1. 若包含duty间 brief、debrief，则按seg node累加fdp，seg间距不计入FDP
		//2. 若没有dutyNode，则按 2102判断是否长中转，若是则按2102计算brief/debrief加入FDP
		//3. 若不是长中转，则将seg间距加入
		if (briefBetweenSeg && debriefBetweenSeg) {
			if (RuleParams::GetInstancePtr()->bIncludeLongTransitBreak) {
				long tmpFDP = static_cast<long>(std::min(briefBetweenSeg->getStartTimeUtcAct(), upperLimitTimeUtc) - std::max(debriefBetweenSeg->getEndTimeUtcAct(), lowerLimitTimeUtc));
				fdp += (tmpFDP > 0 ? tmpFDP : 0);
			}
		}
		else if ((!briefBetweenSeg || !debriefBetweenSeg) && i != 0 && nowSeg && preSeg) {
			const auto prevAssignment = dbData->assignmentNameMap.find(Segments[i - 1]->getAssignment());
			const auto currAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());

			if (minConnectionTimeSeconds > 0) {
				// connection time based on actual time
				auto realConnection = Segments[i]->getStartTimeUtcAct() - Segments[i - 1]->getEndTimeUtcAct();
				// assumed connection (only different from real connection if use stick time)
				auto assumedConnection = Segments[i]->getStartTimeUtcAct() - getAssumedArrivalUtc(Segments[i - 1]);
				// ganranteed connection time, max of assumed and min connection parameter
				auto ganranteedConnection = std::max<long long>(assumedConnection, minConnectionTimeSeconds);

				// cover edge case if real connection is 0 and happens outside of lower-upper range
				auto isConnectionOverlap = TimeUtils::IsAbsoluteTimesCovered(Segments[i - 1]->getEndTimeUtcAct(), Segments[i]->getStartTimeUtcAct(), lowerLimitTimeUtc, upperLimitTimeUtc);
				// split ganranteed connection time if real connection overlaps with limit range, split by inside lower-upper and outside
				auto overlappedConnection = static_cast<long>(std::min(Segments[i]->getStartTimeUtcAct(), upperLimitTimeUtc) - std::max(getAssumedArrivalUtc(Segments[i - 1]), lowerLimitTimeUtc));
				auto splitConnection = ganranteedConnection;
				if (!isConnectionOverlap)
					splitConnection = 0;
				else if (overlappedConnection >= 0 && overlappedConnection < realConnection)
					splitConnection = std::round(double(overlappedConnection) / realConnection * assumedConnection);
				fdp += splitConnection;
			}
			else {
				// long transit case no need to consider min connection time
				long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(Segments[i - 1], Segments[i]);
				if (longTransit) {
					//20201106 mantis#8973: 大过站FDP计算逻辑更正
					int blank = static_cast<int>(Segments[i]->getStartTimeUtcSch() - Segments[i - 1]->getEndTimeUtcAct());
					if (blank > (longTransit->pseudoCI + longTransit->pseudoCO + longTransit->pseudoDropoff + longTransit->pseudoPickup) * 60) {

						time_t pseudoCI_EndTime = Segments[i]->getStartTimeUtcSch();
						time_t pseudoCI_StartTime = pseudoCI_EndTime - longTransit->pseudoCI * 60;
						long pseudoCI_FDP = static_cast<long>(std::min(pseudoCI_EndTime, upperLimitTimeUtc) - std::max(pseudoCI_StartTime, lowerLimitTimeUtc));
						pseudoCI_FDP = (pseudoCI_FDP > 0 ? pseudoCI_FDP : 0);

						time_t pseudoPickup_EndTime = pseudoCI_StartTime;
						time_t pseudoPickup_StartTime = pseudoPickup_EndTime - longTransit->pseudoPickup * 60;
						long pseudoPickup_FDP = static_cast<long>(std::min(pseudoPickup_EndTime, upperLimitTimeUtc) - std::max(pseudoPickup_StartTime, lowerLimitTimeUtc));
						pseudoPickup_FDP = (pseudoPickup_FDP > 0 ? pseudoPickup_FDP : 0);

						time_t pseudoCO_StartTime = Segments[i - 1]->getEndTimeUtcAct();
						time_t pseudoCO_EndTime = pseudoCO_StartTime + longTransit->pseudoCO * 60;
						long pseudoCO_FDP = static_cast<long>(std::min(pseudoCO_EndTime, upperLimitTimeUtc) - std::max(pseudoCO_StartTime, lowerLimitTimeUtc));
						pseudoCO_FDP = (pseudoCO_FDP > 0 ? pseudoCO_FDP : 0);

						time_t pseudoDropoff_StartTime = pseudoCO_EndTime;
						time_t pseudoDropoff_EndTime = pseudoDropoff_StartTime + longTransit->pseudoDropoff * 60;
						long pseudoDropoff_FDP = static_cast<long>(std::min(pseudoDropoff_EndTime, upperLimitTimeUtc) - std::max(pseudoDropoff_StartTime, lowerLimitTimeUtc));
						pseudoDropoff_FDP = (pseudoDropoff_FDP > 0 ? pseudoDropoff_FDP : 0);

						if (RuleParams::GetInstancePtr()->bIncludeLongTransitCI) {

							//fdp += longTransit->pseudoCI * 60;
							fdp += pseudoCI_FDP;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitCO) {
							//fdp += longTransit->pseudoCO * 60;
							fdp += pseudoCO_FDP;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitDropoff) {
							//fdp += longTransit->pseudoDropoff * 60;
							fdp += pseudoDropoff_FDP;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitPickup) {
							//fdp += longTransit->pseudoPickup * 60;
							fdp += pseudoPickup_FDP;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitBreak) {
							long blankFDP = static_cast<int>(std::min(Segments[i]->getStartTimeUtcSch(), upperLimitTimeUtc) - std::max(Segments[i - 1]->getEndTimeUtcAct(), lowerLimitTimeUtc));
							blankFDP = (blankFDP > 0 ? blankFDP : 0);
							//blankFDP为0，pseudoCI_FDP、pseudoCO_FDP、 pseudoDropoff_FDP、pseudoPickup_FDP应该都为0（时间段不在[lowerLimitTimeUtc, upperLimitTimeUtc]范围内）
							long tmpFDP = blankFDP - pseudoCI_FDP - pseudoCO_FDP - pseudoDropoff_FDP - pseudoPickup_FDP;
							fdp += (tmpFDP > 0 ? tmpFDP : 0);
						}
					}
					else {
						long blankFDP = static_cast<int>(std::min(Segments[i]->getStartTimeUtcSch(), upperLimitTimeUtc) - std::max(Segments[i - 1]->getEndTimeUtcAct(), lowerLimitTimeUtc));
						blankFDP = (blankFDP > 0 ? blankFDP : 0);
						fdp += blankFDP;
					}
					//20201103 mantis#8950 seg长中转需加上 ATD-STD
					long tmpFDP = static_cast<long>(std::min(Segments[i]->getStartTimeUtcAct(), upperLimitTimeUtc) - std::max(Segments[i]->getStartTimeUtcSch(), lowerLimitTimeUtc));
					fdp += (tmpFDP > 0 ? tmpFDP : 0);
				}
				else {
					//20200917 ain, mantis#8766, seg之间不是长中转则全部算入fdp
					long tmpFDP = static_cast<long>(std::min(Segments[i]->getStartTimeUtcAct(), upperLimitTimeUtc) - std::max(Segments[i - 1]->getEndTimeUtcAct(), lowerLimitTimeUtc));
					fdp += (tmpFDP > 0 ? tmpFDP : 0);
				}
			}
			// end of long transit time
		}
		//SEG自身
		nowSegIsHasNode = false;
		map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());
		if (segAssignment == dbData->assignmentNameMap.end() || segAssignment->second->FDP_PCT == 0) {
			/*if ((i == 0 && RuleParams::GetInstancePtr()->bPreFerryCount)
				|| (i == Segments.size() - 1 && RuleParams::GetInstancePtr()->bIncludeLastDHD)){*/
			if ((dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bIncludeLastDHD && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bPreFerryCount && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePreSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePreGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePreStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePreHSB && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePostHSB && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				) {
				// tmpFDP is overlap (truncated) FDP inside lower-upper range
				long tmpFDP = static_cast<long>(std::min(Segments[i]->getEndTimeUtcAct(), upperLimitTimeUtc) - std::max(Segments[i]->getStartTimeUtcAct(), lowerLimitTimeUtc));
				// acutal FDP is ATA-ATD
				long actualFDP = Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct();
				if (useStickTime) {
					long segmentSeconds = getStickDurationSeconds(Segments[i]);
					// split segment stick time by overlap inside lower - upper and outside
					auto isSegmentOverlap = TimeUtils::IsAbsoluteTimesCovered(Segments[i]->getStartTimeUtcAct(), Segments[i]->getEndTimeUtcAct(), lowerLimitTimeUtc, upperLimitTimeUtc);
					auto splitFDP = segmentSeconds;
					if (!isSegmentOverlap)
						splitFDP = 0;
					else if (tmpFDP >= 0 && tmpFDP < actualFDP)
						splitFDP = std::round(double(tmpFDP) / actualFDP * segmentSeconds);
					tmpFDP = splitFDP;
				}
				fdp += (tmpFDP > 0 ? tmpFDP : 0);
			}
			continue;
		}
		double fdpPct = segAssignment->second->FDP_PCT;

		//20190924 ain, mantis#6777, 引入dutyNode后fdp计算不再需要CalculationManday[FDP], 直接用seg.act计算
		//fdp += Segments[i]->getEndTimeUtc(FDP.end) - Segments[i]->getStartTimeUtc(FDP.str);
		long tmpFDP = static_cast<long>(std::min(Segments[i]->getEndTimeUtcAct(), upperLimitTimeUtc) - std::max(Segments[i]->getStartTimeUtcAct(), lowerLimitTimeUtc));
		long actualFDP = Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct();
		if (useStickTime) {
			long segmentSeconds = getStickDurationSeconds(Segments[i]);
			// split segment stick time by overlap inside lower - upper and outside
			auto isSegmentOverlap = TimeUtils::IsAbsoluteTimesCovered(Segments[i]->getStartTimeUtcAct(), Segments[i]->getEndTimeUtcAct(), lowerLimitTimeUtc, upperLimitTimeUtc);
			auto splitFDP = segmentSeconds;
			if (!isSegmentOverlap)
				splitFDP = 0;
			if (tmpFDP >= 0 && tmpFDP < actualFDP)
				splitFDP = std::round(double(tmpFDP) / actualFDP * segmentSeconds);
			tmpFDP = splitFDP;
		}
		fdp += static_cast<long>((tmpFDP > 0 ? tmpFDP : 0) * fdpPct);
	}

	//按照2107法规固定增加FIXED EXTENSTION设置值
	//fdp += 60 * (RuleParams::GetInstancePtr()->iFixedValueToFDP) + 60 * (RuleParams::GetInstancePtr()->beforeFixValueToFDP);
	if (RuleParams::GetInstancePtr()->iFixedValueToFDP > 0) { //iFixedValueToFDP表示FDP先后扩展
		time_t afterFixValueStartTime = duty->getLastFdpSegment()->getEndTimeUtcAct();
		if (RuleParams::GetInstancePtr()->bDropoffCount) {
			afterFixValueStartTime = duty->getLastDropoff()->getEndTimeUtcAct();
		}
		else if (RuleParams::GetInstancePtr()->bIncludeCO) {
			afterFixValueStartTime = duty->getLastDebrief()->getEndTimeUtcAct();
		}
		time_t afterFixValueEndTime = afterFixValueStartTime + 60 * (RuleParams::GetInstancePtr()->iFixedValueToFDP);

		long tmpFDP = static_cast<long>(std::min(afterFixValueEndTime, upperLimitTimeUtc) - std::max(afterFixValueStartTime, lowerLimitTimeUtc));
		fdp += (tmpFDP > 0 ? tmpFDP : 0);
	}

	if (RuleParams::GetInstancePtr()->beforeFixValueToFDP > 0) { //beforeFixValueToFDP表示FDP先前扩展
		time_t beforeFixValueEndTime = duty->getFirstFdpSegment()->getStartTimeUtcAct();
		if (RuleParams::GetInstancePtr()->bPickupCount) {
			beforeFixValueEndTime = duty->getFirstPickup()->getStartTimeUtcAct();
		}
		else if (RuleParams::GetInstancePtr()->bIncludeCI) {
			beforeFixValueEndTime = duty->getFirstBreif()->getStartTimeUtcAct();
		}

		time_t afterFixValueStartTime = beforeFixValueEndTime - 60 * (RuleParams::GetInstancePtr()->beforeFixValueToFDP);
		long tmpFDP = static_cast<long>(std::min(beforeFixValueEndTime, upperLimitTimeUtc) - std::max(afterFixValueStartTime, lowerLimitTimeUtc));
		fdp += (tmpFDP > 0 ? tmpFDP : 0);
	}

	// only for TG, 比较transitTime和postActivityThreshold=30比较，如果小于30分钟，fdp减去俩者的差
	//if (RuleParams::GetInstancePtr()->postActivityThreshold > 0) {
	//	fdp += RuleParams::GetInstancePtr()->postActivityThreshold * 60;
	//	const auto& lastFdpSegment = duty->getLastFdpSegment();
	//	if (lastFdpSegment) {
	//		const auto& index = lastFdpSegment->getSegSeq();
	//		if (index < (int)duty->getNumSegments()) {
	//			int transitTime = static_cast<int>(duty->getSegments()[index]->getStartTimeUtc("ACT") - lastFdpSegment->getEndTimeUtc("ACT"));
	//			if (transitTime < RuleParams::GetInstancePtr()->postActivityThreshold * 60) {
	//				fdp -= RuleParams::GetInstancePtr()->postActivityThreshold * 60 - transitTime;
	//			}
	//		}
	//	}
	//}
	if (RuleParams::GetInstancePtr()->postActivityThreshold > 0) {
		const auto& lastFdpSegment = duty->getLastFdpSegment();
		if (lastFdpSegment != nullptr) {
			const auto& index = lastFdpSegment->getSegSeq();
			time_t postActivityThresholdStartTime = lastFdpSegment->getStartTimeUtcAct();
			time_t postActivityThresholdEndTime = postActivityThresholdStartTime + RuleParams::GetInstancePtr()->postActivityThreshold * 60;
			if (index < (int)duty->getNumSegments()) {//Duty"最后一个飞行航段"不是Duty的最后一个航段，说明紧接有DHD航段
				//transitTime为"最后一个飞行航段"到"紧接下一个DHD航段"的中转时间，lastFdpSegment最后飞行航段，duty->getSegments()[index]是紧接下一个DHD航段
				int transitTime = static_cast<int>(duty->getSegments()[index]->getStartTimeUtc("ACT") - lastFdpSegment->getEndTimeUtc("ACT"));
				if (transitTime < RuleParams::GetInstancePtr()->postActivityThreshold * 60) {
					long tmpFDP = static_cast<long>(std::min(duty->getSegments()[index]->getStartTimeUtc("ACT"), upperLimitTimeUtc) - std::max(lastFdpSegment->getEndTimeUtc("ACT"), lowerLimitTimeUtc));
					fdp += (tmpFDP > 0 ? tmpFDP : 0);
				}
				else {

					long tmpFDP = static_cast<long>(std::min(postActivityThresholdEndTime, upperLimitTimeUtc) - std::max(postActivityThresholdStartTime, lowerLimitTimeUtc));
					fdp += (tmpFDP > 0 ? tmpFDP : 0);
				}
			}
			else {//Duty"最后一个飞行航段"就是Duty的最后一个航段
				long tmpFDP = static_cast<long>(std::min(postActivityThresholdEndTime, upperLimitTimeUtc) - std::max(postActivityThresholdStartTime, lowerLimitTimeUtc));
				fdp += (tmpFDP > 0 ? tmpFDP : 0);
			}
		}

	}
	return fdp / 60;
}

long DutyUtils::GetDutyFDPInMinsWithCover(Duty* duty, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData) {
	if (!duty) {
		return 0;
	}

	long fdp = 0;
	const vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes = duty->pairingDutyNodes;
	bool nowSegIsHasNode = false;
	vector<Segment*> Segments = duty->getSegments();
	bool hasFDP = false;

	const bool useStickTime = RuleParams::GetInstancePtr()->bUseStickTime;
	const long minConnectionTimeSeconds = static_cast<long>(RuleParams::GetInstancePtr()->minConnectionTimeMinutes * 60);

	auto getStickDurationSeconds = [](Segment* seg) -> long {
		const long blkSeconds = seg->getBlkSeconds() > 0 ? seg->getBlkSeconds() : static_cast<long>(seg->getEndTimeUtcAct() - seg->getStartTimeUtcAct());
		return std::max<long>(0, blkSeconds);
	};

	auto getAssumedArrivalUtc = [&](Segment* seg) -> time_t {
		if (useStickTime) {
			time_t stdUtc = seg->getStartTimeUtcAct();
			return stdUtc + getStickDurationSeconds(seg);
		}
		return seg->getEndTimeUtcAct();
	};
	//检查是否包含FDP > 0 段
	for (std::size_t i = 0; i < Segments.size(); i++) {
		map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());
		if (segAssignment != dbData->assignmentNameMap.end() && segAssignment->second != nullptr && segAssignment->second->FDP_PCT > 0) {
			hasFDP = true;
			break;
		}
	}
	if (!hasFDP) {
		return 0;
	}
	//if (Segments[0]->getDBId() == 50438827) {
	//	cout <<  "";
	//}
	//计算Duty级dutyNode
	//Duty的（PICKUP+BRIEF）和（DEBRIEF+DROPOFF）分别作为整理计入FDP
	int dutyNodeBriefFDP = 0, dutyNodeDebriefFDP = 0;
	bool dutyNodeBriefCovered = false, dutyNodeDebriefCovered = false;
	for (std::size_t i = 0; i < pairingDutyNodes.size(); i++) {
		if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "BRIEF" && RuleParams::GetInstancePtr()->bIncludeCI) {
			if (TimeUtils::IsAbsoluteTimesCovered(pairingDutyNodes[i]->getStartUtc(), pairingDutyNodes[i]->getEndUtc(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
				dutyNodeBriefCovered = true;
			}
			dutyNodeBriefFDP += static_cast<long>(pairingDutyNodes[i]->getEndUtc() - pairingDutyNodes[i]->getStartUtc());
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "DEBRIEF" && RuleParams::GetInstancePtr()->bIncludeCO) {
			if (TimeUtils::IsAbsoluteTimesCovered(pairingDutyNodes[i]->getStartUtc(), pairingDutyNodes[i]->getEndUtc(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
				dutyNodeDebriefCovered = true;
			}
			dutyNodeDebriefFDP += static_cast<long>(pairingDutyNodes[i]->getEndUtc() - pairingDutyNodes[i]->getStartUtc());
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "DROPOFF" && RuleParams::GetInstancePtr()->bDropoffCount) {
			if (TimeUtils::IsAbsoluteTimesCovered(pairingDutyNodes[i]->getStartUtc(), pairingDutyNodes[i]->getEndUtc(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
				dutyNodeDebriefCovered = true;
			}
			dutyNodeDebriefFDP += static_cast<long>(pairingDutyNodes[i]->getEndUtc() - pairingDutyNodes[i]->getStartUtc());
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "PICKUP" && RuleParams::GetInstancePtr()->bPickupCount) {
			if (TimeUtils::IsAbsoluteTimesCovered(pairingDutyNodes[i]->getStartUtc(), pairingDutyNodes[i]->getEndUtc(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
				dutyNodeBriefCovered = true;
			}
			dutyNodeBriefFDP += static_cast<long>(pairingDutyNodes[i]->getEndUtc() - pairingDutyNodes[i]->getStartUtc());
		}
	}
	if (dutyNodeBriefCovered) {
		fdp += dutyNodeBriefFDP;
	}
	if (dutyNodeDebriefCovered) {
		fdp += dutyNodeDebriefFDP;
	}

	bool isLT2ndDHD = false;
	if (RuleParams::GetInstancePtr()->bIncludeLastDHD == false) {
		bool transitStart = false;
		isLT2ndDHD = true;
		for (int s = 0; s < (int)Segments.size() - 1; s++) {
			auto seg = Segments[s];
			auto nextseg = Segments[s + 1];
			if (transitStart == false) {
				long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(seg, nextseg);
				if (longTransit)
					transitStart = true;
			}

			if (transitStart) {
				if (nextseg->getIsOperating()) {
					isLT2ndDHD = false;
					break;
				}
			}
		}
		if (transitStart == false)
			isLT2ndDHD = false;
	}

	long longTransitStart = 0;
	long longTransitEnd = 0;
	//20210725 ain, mantis#9399, fdp统计 seg层级 node增加 type=SEGMENT判断
	//计算Seg级 DutyNode
	//Segment的（DEBRIEF+DROPOFF+PICKUP+BRIEF）作为整理计入FDP
	int segmentDutyNodeFDP = 0;
	bool segmentDutyNodeCovered = false;
	for (std::size_t j = 0; j < pairingDutyNodes.size(); j++) {
		if (pairingDutyNodes[j]->getType() != "SEGMENT") {
			continue;
		}
		if (isLT2ndDHD)
			continue;
		bool nodeMatchSeg = false;
		for (std::size_t i = 0; i < Segments.size(); i++) {
			if (Segments[i]->getSegmentId() == pairingDutyNodes[j]->getToSegmentId())
				nodeMatchSeg = true;
		}
		if (nodeMatchSeg) {
			nowSegIsHasNode = true;
			if (pairingDutyNodes[j]->getNode() == "BRIEF" && RuleParams::GetInstancePtr()->bIncludeLongTransitCI) {
				if (TimeUtils::IsAbsoluteTimesCovered(pairingDutyNodes[j]->getStartUtc(), pairingDutyNodes[j]->getEndUtc(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
					segmentDutyNodeCovered = true;
				}
				segmentDutyNodeFDP += static_cast<long>(pairingDutyNodes[j]->getEndUtc() - pairingDutyNodes[j]->getStartUtc());
			}
			else if (pairingDutyNodes[j]->getNode() == "DEBRIEF" && RuleParams::GetInstancePtr()->bIncludeLongTransitCO) {
				if (TimeUtils::IsAbsoluteTimesCovered(pairingDutyNodes[j]->getStartUtc(), pairingDutyNodes[j]->getEndUtc(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
					segmentDutyNodeCovered = true;
				}
				segmentDutyNodeFDP += static_cast<long>(pairingDutyNodes[j]->getEndUtc() - pairingDutyNodes[j]->getStartUtc());
			}
			else if (pairingDutyNodes[j]->getNode() == "DROPOFF" && RuleParams::GetInstancePtr()->bDropoffCount) {
				if (TimeUtils::IsAbsoluteTimesCovered(pairingDutyNodes[j]->getStartUtc(), pairingDutyNodes[j]->getEndUtc(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
					segmentDutyNodeCovered = true;
				}
				segmentDutyNodeFDP += static_cast<long>(pairingDutyNodes[j]->getEndUtc() - pairingDutyNodes[j]->getStartUtc());
			}
			else if (pairingDutyNodes[j]->getNode() == "PICKUP" && RuleParams::GetInstancePtr()->bPickupCount) {
				if (TimeUtils::IsAbsoluteTimesCovered(pairingDutyNodes[j]->getStartUtc(), pairingDutyNodes[j]->getEndUtc(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
					segmentDutyNodeCovered = true;
				}
				segmentDutyNodeFDP += static_cast<long>(pairingDutyNodes[j]->getEndUtc() - pairingDutyNodes[j]->getStartUtc());
			}

			///TEST
			//if (duty->getNumSegments() > 0 && duty->getSegment(0)->getDBId() == 61840835) {
			//	cout << "**DBG CustomBiz calculateDutyFdp fdp=" << fdp
			//		<< " seg.dutyNode=" << pairingDutyNodes[j]->getType()
			//		<< " toSegmentId=" << pairingDutyNodes[j]->getToSegmentId()
			//		<< " " << utcToUtcString(pairingDutyNodes[j]->getStartUtc())
			//		<< " " << utcToUtcString(pairingDutyNodes[j]->getEndUtc())
			//		<< endl;
			//}
		}
	}
	if (segmentDutyNodeCovered) {
		fdp += segmentDutyNodeFDP;
	}

	//遍历Seg
	for (int i = 0; i < (int)Segments.size(); i++) {
		bool preSeg = false, nowSeg = false;
		if (i > 0) {
			map<string, SharedPtr<ASSIGNMENT>>::iterator sAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());
			if ((sAssignment != dbData->assignmentNameMap.end() && sAssignment->second->FDP_PCT > 0)
				|| (RuleParams::GetInstancePtr()->bPreFerryCount && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludeLastDHD && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePreSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePreGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePreStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))) {
				nowSeg = true;
			}
			sAssignment = dbData->assignmentNameMap.find(Segments[i - 1]->getAssignment());
			if ((sAssignment != dbData->assignmentNameMap.end() && sAssignment->second->FDP_PCT > 0)
				|| (RuleParams::GetInstancePtr()->bPreFerryCount && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludeLastDHD && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePreSBY && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePreGround && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePreStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))) {
				preSeg = true;
			}
		}
		//尝试在 seg[i-1]和 seg[i]之间寻找 brief、debrief，用于后续判断是否应将seg间距加入FDP
		shared_ptr<PairingDutyNode> briefBetweenSeg;
		shared_ptr<PairingDutyNode> debriefBetweenSeg;
		if (i > 0) {
			for (auto& node : pairingDutyNodes) {
				if (node->getType() != "SEGMENT") {
					continue;
				}
				if (node->getNode() == "BRIEF" && node->getToSegmentId() == Segments[i]->getSegmentId()) {
					briefBetweenSeg = node;
				}
				if (node->getNode() == "DEBRIEF" && node->getFromSegmentId() == Segments[i - 1]->getSegmentId()) {
					debriefBetweenSeg = node;
				}
			}
		}
		//SEG之间的计算
		//1. 若包含duty间 brief、debrief，则按seg node累加fdp，seg间距不计入FDP
		//2. 若没有dutyNode，则按 2102判断是否长中转，若是则按2102计算brief/debrief加入FDP
		//3. 若不是长中转，则将seg间距加入
		if (briefBetweenSeg && debriefBetweenSeg) {
			if (RuleParams::GetInstancePtr()->bIncludeLongTransitBreak) {
				if (TimeUtils::IsAbsoluteTimesCovered(debriefBetweenSeg->getEndTimeUtcAct(), briefBetweenSeg->getStartTimeUtcAct(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
					fdp += static_cast<long>(briefBetweenSeg->getStartTimeUtcAct() - debriefBetweenSeg->getEndTimeUtcAct());
				}

			}
		}
		else if ((!briefBetweenSeg || !debriefBetweenSeg) && i != 0 && nowSeg && preSeg) {
			if (minConnectionTimeSeconds > 0) {
				long connection = static_cast<long>(Segments[i]->getStartTimeUtcAct() - getAssumedArrivalUtc(Segments[i - 1]));
				if (connection < 0) {
					connection = 0;
				}
				fdp += std::max(connection, minConnectionTimeSeconds);
			}
			else {
				long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(Segments[i - 1], Segments[i]);
				if (longTransit) {
					//20201106 mantis#8973: 大过站FDP计算逻辑更正
					int blank = static_cast<int>(Segments[i]->getStartTimeUtcSch() - Segments[i - 1]->getEndTimeUtcAct());
					//长中转作为一个整体判断是否与[lowerLimitTimeUtc, upperLimitTimeUtc]存在交集
					bool covered = false;
					if (TimeUtils::IsAbsoluteTimesCovered(Segments[i - 1]->getEndTimeUtcAct(), Segments[i]->getStartTimeUtcSch(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
						covered = true;
					}
					if (blank > (longTransit->pseudoCI + longTransit->pseudoCO + longTransit->pseudoDropoff + longTransit->pseudoPickup) * 60) {

						//（pseudoCI、pseudoCO、pseudoDropoff、pseudoPickup）中只要某时间段存在于[lowerLimitTimeUtc, upperLimitTimeUtc]交集，则认为都存在交集。作为整体判断
						time_t pseudoCI_EndTime = Segments[i]->getStartTimeUtcSch();
						time_t pseudoCI_StartTime = pseudoCI_EndTime - longTransit->pseudoCI * 60;
						long pseudoCI_FDP = static_cast<long>(pseudoCI_EndTime - pseudoCI_StartTime);
						pseudoCI_FDP = (pseudoCI_FDP > 0 ? pseudoCI_FDP : 0);

						time_t pseudoPickup_EndTime = pseudoCI_StartTime;
						time_t pseudoPickup_StartTime = pseudoPickup_EndTime - longTransit->pseudoPickup * 60;
						long pseudoPickup_FDP = static_cast<long>(pseudoPickup_EndTime - pseudoPickup_StartTime);
						pseudoPickup_FDP = (pseudoPickup_FDP > 0 ? pseudoPickup_FDP : 0);

						time_t pseudoCO_StartTime = Segments[i - 1]->getEndTimeUtcAct();
						time_t pseudoCO_EndTime = pseudoCO_StartTime + longTransit->pseudoCO * 60;
						long pseudoCO_FDP = static_cast<long>(pseudoCO_EndTime - pseudoCO_StartTime);
						pseudoCO_FDP = (pseudoCO_FDP > 0 ? pseudoCO_FDP : 0);

						time_t pseudoDropoff_StartTime = pseudoCO_EndTime;
						time_t pseudoDropoff_EndTime = pseudoDropoff_StartTime + longTransit->pseudoDropoff * 60;
						long pseudoDropoff_FDP = static_cast<long>(pseudoDropoff_EndTime - pseudoDropoff_StartTime);
						pseudoDropoff_FDP = (pseudoDropoff_FDP > 0 ? pseudoDropoff_FDP : 0);

						if (RuleParams::GetInstancePtr()->bIncludeLongTransitCI && covered) {
							//fdp += longTransit->pseudoCI * 60;
							fdp += pseudoCI_FDP;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitCO && covered) {
							//fdp += longTransit->pseudoCO * 60;
							fdp += pseudoCO_FDP;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitDropoff && covered) {
							//fdp += longTransit->pseudoDropoff * 60;
							fdp += pseudoDropoff_FDP;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitPickup && covered) {
							//fdp += longTransit->pseudoPickup * 60;
							fdp += pseudoPickup_FDP;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitBreak) {
							long blankFDP = static_cast<int>(Segments[i]->getStartTimeUtcSch(), Segments[i - 1]->getEndTimeUtcAct());
							blankFDP = (blankFDP > 0 ? blankFDP : 0);
							//blankFDP为0，pseudoCI_FDP、pseudoCO_FDP、 pseudoDropoff_FDP、pseudoPickup_FDP应该都为0（时间段不在[lowerLimitTimeUtc, upperLimitTimeUtc]范围内）
							long tmpFDP = blankFDP - pseudoCI_FDP - pseudoCO_FDP - pseudoDropoff_FDP - pseudoPickup_FDP;
							if (covered) {
								fdp += (tmpFDP > 0 ? tmpFDP : 0);
							}
						}
					}
					else {
						if (covered) {
							fdp += static_cast<int>(Segments[i]->getStartTimeUtcSch() - Segments[i - 1]->getEndTimeUtcAct());
						}
					}
					//20201103 mantis#8950 seg长中转需加上 ATD-STD
					if (covered) {
						fdp += static_cast<long>(Segments[i]->getStartTimeUtcAct() - Segments[i]->getStartTimeUtcSch());
					}
				}
				else {
					//20200917 ain, mantis#8766, seg之间不是长中转则全部算入fdp
					if (TimeUtils::IsAbsoluteTimesCovered(Segments[i - 1]->getEndTimeUtcAct(), Segments[i]->getStartTimeUtcAct(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
						fdp += static_cast<long>(Segments[i]->getStartTimeUtcAct() - Segments[i - 1]->getEndTimeUtcAct());
					}
				}
			}
		}

		//SEG自身
		nowSegIsHasNode = false;
		map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());
		if (segAssignment == dbData->assignmentNameMap.end() || segAssignment->second->FDP_PCT == 0) {
			/*if ((i == 0 && RuleParams::GetInstancePtr()->bPreFerryCount)
				|| (i == Segments.size() - 1 && RuleParams::GetInstancePtr()->bIncludeLastDHD)){*/
			if ((RuleParams::GetInstancePtr()->bIncludeLastDHD && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bPreFerryCount && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePreSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePreGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePreStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData.get()))
				|| (RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData.get()))
				) {
				if (TimeUtils::IsAbsoluteTimesCovered(Segments[i]->getStartTimeUtcAct(), Segments[i]->getEndTimeUtcAct(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
					long segmentSeconds = useStickTime ? getStickDurationSeconds(Segments[i]) : static_cast<long>(Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct());
					if (segmentSeconds <= 0) {
						segmentSeconds = static_cast<long>(Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct());
					}
					fdp += segmentSeconds;
				}

			}
			continue;
		}
		double fdpPct = segAssignment->second->FDP_PCT;

		//20190924 ain, mantis#6777, 引入dutyNode后fdp计算不再需要CalculationManday[FDP], 直接用seg.act计算
		//fdp += Segments[i]->getEndTimeUtc(FDP.end) - Segments[i]->getStartTimeUtc(FDP.str);
		if (TimeUtils::IsAbsoluteTimesCovered(Segments[i]->getStartTimeUtcAct(), Segments[i]->getEndTimeUtcAct(), lowerLimitTimeUtc, upperLimitTimeUtc)) {
			long segmentSeconds = useStickTime ? getStickDurationSeconds(Segments[i]) : static_cast<long>(Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct());
			if (segmentSeconds <= 0) {
				segmentSeconds = static_cast<long>(Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct());
			}
			fdp += static_cast<long>(segmentSeconds * fdpPct);
		}
	}

	//按照2107法规固定增加FIXED EXTENSTION设置值
	fdp += 60 * (RuleParams::GetInstancePtr()->iFixedValueToFDP) + 60 * (RuleParams::GetInstancePtr()->beforeFixValueToFDP);

	// only for TG, 比较transitTime和postActivityThreshold=30比较，如果小于30分钟，fdp减去俩者的差
	if (RuleParams::GetInstancePtr()->postActivityThreshold > 0) {
		fdp += RuleParams::GetInstancePtr()->postActivityThreshold * 60;
		const auto& lastFdpSegment = duty->getLastFdpSegment();
		if (lastFdpSegment) {
			const auto& index = lastFdpSegment->getSegSeq();
			if (index < (int)duty->getNumSegments()) {
				int transitTime = static_cast<int>(duty->getSegments()[index]->getStartTimeUtc("ACT") - lastFdpSegment->getEndTimeUtc("ACT"));
				if (transitTime < RuleParams::GetInstancePtr()->postActivityThreshold * 60) {
					fdp -= RuleParams::GetInstancePtr()->postActivityThreshold * 60 - transitTime;
				}
			}
		}
	}
	return fdp / 60;
}


//CMSPAL-152 DP 计算规则定制化
inline static long calculateDP(Duty* duty, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, CrewDataContext* dbData) {
	long dp = 0;
	auto& dpDefinition = RuleParams::GetInstancePtr()->getDPDefinition();
	if (!dpDefinition.dpAssignments.empty()) {
		for (const auto& seg : duty->getSegmentsRead()) {
			if (dpDefinition.matchSegment(seg)) {
				dp += (long)(seg->getBlkMinutes() * 60 * dpDefinition.dpPct);
			}
		}
	}
	return dp;
}

//ROSCRW - 15550【EVAFD】【法规】DP 一部分辦公室任務的DP需要扣掉1小時午休時間
inline static long calcuateCoverdDPGap(Segment* segment, const std::shared_ptr<ASSIGNMENT>& segmentAssignment, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, CrewDataContext* dbData) {
	long dpGap = 0;
	int offsetTZMinutes = (segment->getStartTimeLocAct() - segment->getStartTimeUtcAct()) / 60;

	if (dbData->dictionaryMap.find("DP_GAP_TIME_RANGE") != dbData->dictionaryMap.end()) {
		const auto& dicList = dbData->dictionaryMap.at("DP_GAP_TIME_RANGE");
		if (!dicList.empty()) {
			string startHHMM = "";
			string endHHMM = "";
			for (const auto& dic : dicList) {
				if (dic->code == "Start") {
					startHHMM = dic->name;
				}
				else if (dic->code == "End") {
					endHHMM = dic->name;
				}
			}
			time_t checkStartLoc = segment->getStartTimeLocAct();
			time_t checkEndLoc = segment->getEndTimeLocAct();
			if (Utility::GetInstancePtr()->isTimeRangeContained(checkStartLoc, checkEndLoc, startHHMM, endHHMM)) {

				time_t baseLocalDayUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(segment->getStartTimeUtcAct(), offsetTZMinutes);
				time_t dpGapStartTimeUtc = baseLocalDayUtc + (time_t)TimeUtils::hhmmToMinutes(startHHMM) * 60;

				if (dpGapStartTimeUtc > segment->getEndTimeUtcAct() || dpGapStartTimeUtc < segment->getStartTimeUtcAct()) {
					baseLocalDayUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(segment->getEndTimeUtcAct(), offsetTZMinutes);
					dpGapStartTimeUtc = baseLocalDayUtc + (time_t)TimeUtils::hhmmToMinutes(startHHMM) * 60;

				}

				time_t dpGapEndTimeUtc = dpGapStartTimeUtc + (time_t)std::abs(segmentAssignment->DP_GAP) * 60;
				long tmpDP = static_cast<long>(std::min(dpGapEndTimeUtc, upperLimitTimeUtc) - std::max(dpGapStartTimeUtc, lowerLimitTimeUtc));
				dpGap = (tmpDP > 0 ? tmpDP : 0);
				return segmentAssignment->DP_GAP > 0 ? dpGap : -1 * dpGap;
			}

		}
	}
	//没有定义也需要扣除
	else {
		time_t dpGapStartTimeUtc = segment->getEndTimeUtcAct();
		time_t dpGapEndTimeUtc = dpGapStartTimeUtc + (time_t)std::abs(segmentAssignment->DP_GAP) * 60;
		long tmpDP = static_cast<long>(std::min(dpGapEndTimeUtc, upperLimitTimeUtc) - std::max(dpGapStartTimeUtc, lowerLimitTimeUtc));
		dpGap = (tmpDP > 0 ? tmpDP : 0);
		return segmentAssignment->DP_GAP > 0 ? dpGap : -1 * dpGap;
	}

	return dpGap;
}

long DutyUtils::GetDutyDPInMinsWithTruncation(Duty* duty, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData) {
	if (!duty) {
		return 0;
	}

	long actDP = 0;
	auto iterPair = dbData->pairingIdMap.find(duty->getPairingId());
	string pairingAssignment = iterPair != dbData->pairingIdMap.end() ? iterPair->second->getQualifier() : "FLY";
	map<string, SharedPtr<ASSIGNMENT>>::iterator dbPairingAssignment = dbData->assignmentNameMap.find(pairingAssignment);

	CalculationManday ACT_DP = dbData->getCalculationManday("ACT DP");
	time_t act_dpStart = duty->getStartTimeUtc(ACT_DP.str);
	time_t act_dpEnd = duty->getEndTimeUtc(ACT_DP.end);

	//DP/ACT_DP
	double dpPct = 1;// (dbPairingAssignment != dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->DP_PCT : 1;
	int dpGap = 0;
	int beforePctDpGap = 0;// (dbPairingAssignment != dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->before_pct_dp_gap * 60 : 0;
	int afterPctDpGap = 0;// (dbPairingAssignment != dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->after_pct_dp_gap * 60 : 0;

	if (dbPairingAssignment != dbData->assignmentNameMap.end()) {
		dpPct = dbPairingAssignment->second->DP_PCT;


		if (dbPairingAssignment->second->before_pct_dp_gap > 0) {
			time_t beforePctDPEndTime = duty->getFirstBreif()->getStartTimeUtcAct();
			time_t beforePctDPStartTime = beforePctDPEndTime - (time_t)60 * (dbPairingAssignment->second->before_pct_dp_gap);

			long tmpDP = static_cast<long>(std::min(beforePctDPEndTime, upperLimitTimeUtc) - std::max(beforePctDPStartTime, lowerLimitTimeUtc));
			beforePctDpGap = (tmpDP > 0 ? tmpDP : 0);
		}

		if (dbPairingAssignment->second->after_pct_dp_gap > 0) {
			time_t afterPctDPStartTime = duty->getLastDebrief()->getEndTimeUtcAct();
			time_t afterPctDPEndTime = afterPctDPStartTime + (time_t)dbPairingAssignment->second->after_pct_dp_gap * 60;

			long tmpDP = static_cast<long>(std::min(afterPctDPEndTime, upperLimitTimeUtc) - std::max(afterPctDPStartTime, lowerLimitTimeUtc));
			afterPctDpGap = (tmpDP > 0 ? tmpDP : 0);
		}
	}

	//CMSPAL-152 DP 计算规则定制化(待确定如何截断，现在有问题)
	int dpAdjust = calculateDP(duty, lowerLimitTimeUtc, upperLimitTimeUtc, dbData.get());

	//ROSCRW - 15550【EVAFD】【法规】DP 一部分辦公室任務的DP需要扣掉1小時午休時間
	for (const auto& seg : duty->getSegmentsRead()) {
		const auto& dbSegAssignment = dbData->assignmentNameMap.find(seg->getAssignment());
		if (dbSegAssignment == dbData->assignmentNameMap.end())
			continue;

		//if (Utility::GetInstancePtr()->checkCoverdDPGapTimeRange(seg->getStartTimeLocAct(), seg->getEndTimeLocAct(), dbData.get())) {
		//	dpGap += dbSegAssignment->second->DP_GAP;
		//}
		dpGap = calcuateCoverdDPGap(seg, dbSegAssignment->second, lowerLimitTimeUtc, upperLimitTimeUtc, dbData.get());
	}

	if (act_dpStart < act_dpEnd)
	{
		//long dp = static_cast<long>((act_dpEnd - act_dpStart + beforePctDpGap) * dpPct) + dpGap * 60 + afterPctDpGap + dpAdjust;
		time_t overlap_start = std::max(act_dpStart, lowerLimitTimeUtc);
		time_t overlap_end = std::min(act_dpEnd, upperLimitTimeUtc);
		long overlap_duration_seconds = 0;
		if (overlap_end > overlap_start) {
			overlap_duration_seconds = overlap_end - overlap_start;
		}

		long dp = static_cast<long>((overlap_duration_seconds + beforePctDpGap) * dpPct) + dpGap * 60 + afterPctDpGap + dpAdjust;
		actDP = dp / 60;
	}
	return actDP;
}

bool DutyUtils::containFly(const Duty* duty) {
	for (auto& seg : duty->getSegments()) {
		if (seg->getAssignment() == "FLY" || seg->getAssignment() == "OPR") {
			return true;
		}
	}
	return false;
}

//Duty是否纯飞行（即Duty所有Segment Assignment都是FLY)
bool DutyUtils::IsPureFly(const Duty* duty) {
	int flyNum = 0;
	for (auto& seg : duty->getSegments()) {
		if (seg->getAssignment() == "FLY" || seg->getAssignment() == "OPR") {
			flyNum++;
		}
	}
	return flyNum == duty->getSegments().size();
}

//Duty是否纯DHD（即Duty所有Segment Assignment都是DHD)
bool DutyUtils::IsPureDHD(const Duty* duty) {
	int dhdNum = 0;
	for (auto& seg : duty->getSegments()) {
		if (seg->getAssignment() == "DHD" || seg->getAssignment() == "PNC") {
			dhdNum++;
		}
	}
	return dhdNum == duty->getSegments().size();
}

//获取duty type
//优先级 I > R > D
string DutyUtils::getDutyType(const Duty* duty) {
	bool hasI = false, hasR = false, hasD = false;
	for (const auto& seg : duty->getSegments()) {
		if (seg->getDomIntType() == "I")
			hasI = true;
		else if (seg->getDomIntType() == "R")
			hasR = true;
		else if (seg->getDomIntType() == "D")
			hasD = true;
	}

	if (hasI) return "I";
	if (hasR) return "R";
	if (hasD) return "D";
	return "";
}

bool DutyUtils::IsLongPerdiem(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
	return DutyUtils::IsStationOfLongPerdiemRoutes(duty->getFirstSegment()->getDepStationRead(), dbData)
		|| DutyUtils::IsStationOfLongPerdiemRoutes(duty->getLastSegment()->getArrStationRead(), dbData);
}

bool DutyUtils::GetFleetAndSubFleet(string& fleet, string& subFleet, const Duty* duty) {
	bool valid = true;
	auto lastFlySeg = duty->getLastFlySegment();
	if (lastFlySeg == nullptr) {
		fleet = "";
		subFleet = "";
		valid = false;
	}
	else {
		fleet = lastFlySeg->getFleetCD();
		subFleet = lastFlySeg->getSubFleet();
	}
	return valid;
}

time_t DutyUtils::GetDutyStartTimeByRuleParamForHX(const Duty* duty, const ROSTER* preRoster, const time_t calloutTime) {

	if (!duty)
		return 0;

	if (!preRoster)
		return duty->getStartTimeUtcAct();

	time_t dutyStartTime = duty->getStartTimeUtcAct();
	const auto & ruleParams = RuleParams::GetInstancePtr()->getStandbyFDPAndRestDefinitions();

	if (ruleParams.empty())
		return 0;

	for (const auto& ruleParam : ruleParams) {

		if (MatchStandbyRuleParam(duty, preRoster, calloutTime, ruleParam)) {
			return GetTimeByRuleParam(duty, preRoster, calloutTime, "REPORT START", ruleParam);

		}
	}
	return 0;
}

long long DutyUtils::GetPrecedingRestLength(const time_t startUtc, const time_t endUtc, const int offsetTzMinute) {
	Local_Night_Definition local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	int localNightStart = TimeUtils::hhmmToMinutes(local_night.LocalStart);
	int localNightEnd = TimeUtils::hhmmToMinutes(local_night.LocalEnd);
	int intervalInMinutes = TimeUtils::GetDurationOfHHmm(localNightStart, localNightEnd);
	int minLocalNightMinute = TimeUtils::hhmmToMinutes(local_night.MinRestInterval);

	time_t startOfDay = TimeUtils::GetStartTimeOfDay(startUtc + offsetTzMinute * 60);
	time_t localNightEndTime = 0;
	// 如果开始时间在localNightStart之前
	if (startUtc + offsetTzMinute * 60 <= startOfDay + localNightStart * 60) {
		localNightEndTime = startOfDay + localNightStart * 60 + minLocalNightMinute * 60;

	}
	// 如果开始时间加最小local_night时长，大于localNightEnd，则往后判断一天
	else if ((startUtc + (offsetTzMinute + minLocalNightMinute) * 60) / 86400 > localNightEnd * 60) {
		startOfDay += 86400;
		localNightEndTime = startOfDay + localNightStart * 60 + minLocalNightMinute * 60;

	}
	return std::max((long long)0L, (long long)(endUtc + offsetTzMinute * 60 - localNightEndTime));
}

bool DutyUtils::MatchStandbyRuleParam(const Duty* duty, const ROSTER* preRoster, const time_t calloutTime, const std::shared_ptr<Standby_FDP_And_Rest_Definition> ruleParam) {

	time_t dutyStartTime = duty->getStartTimeUtcAct();

	if (!ruleParam->standbyAssignments.empty() && !ruleParam->standbyAssignments[0].empty() && ruleParam->standbyAssignments[0] != "*"
		&& find(ruleParam->standbyAssignments.begin(), ruleParam->standbyAssignments.end(), preRoster->qualifier) == ruleParam->standbyAssignments.end())
		return false;

	bool dutyOverlapRoster = (dutyStartTime >= preRoster->getStartTimeUtcAct() && dutyStartTime <= preRoster->getEndTimeUtcAct());
	if (dutyOverlapRoster != ruleParam->dutyWithinThePlannedStandby)
		return false;

	if (!ruleParam->callOutToFlightGapRange.empty() && ruleParam->callOutToFlightGapRange != "*") {
		int gapMinutes = static_cast<int>((dutyStartTime - calloutTime) / 60);
		if (gapMinutes < ruleParam->callOutToFlightGapStart || gapMinutes > ruleParam->callOutToFlightGapEnd)
			return false;

	}

	return true;
}

time_t DutyUtils::GetTimeByRuleParam(const Duty* duty, const ROSTER* preRoster, const time_t calloutTime, const string type, const std::shared_ptr<Standby_FDP_And_Rest_Definition> ruleParam) {

	time_t result = 0;

	if (type == "FDP START") {
		//默认值，防止没有匹配到任何条件
		result = duty->getStartTimeUtcAct();
		if (ruleParam->actualFdpCalcStart == "DUTYSTART") {
			result = duty->getStartTimeUtcAct();
		}
		else if (ruleParam->actualFdpCalcStart == "STANDBYDUTYSTART") {
			result = preRoster->getStartTimeUtcAct();
		}
	}
	else if (type == "FDP END") {
		result = duty->getEndTimeUtcAct();
		if (ruleParam->actualFdpCalcEnd == "DUTYEND") {
			result = duty->getEndTimeUtcAct();
		}
	}
	else if (type == "DP START") {
		result = duty->getStartTimeUtcAct();
		if (ruleParam->actualFdpCalcStart == "DUTYSTART") {
			result = duty->getStartTimeUtcAct();
		}
		else if (ruleParam->actualFdpCalcStart == "STANDBYDUTYSTART") {
			result = preRoster->getStartTimeUtcAct();
		}
	}
	else if (type == "DP END") {
		result = duty->getEndTimeUtcAct();
		if (ruleParam->actualFdpCalcEnd == "DUTYEND") {
			result = duty->getEndTimeUtcAct();
		}
	}
	else if (type == "REPORT START") {
		result = duty->getStartTimeUtcAct();
		if (ruleParam->actualFdpCalcStart == "DUTYSTART") {
			result = duty->getStartTimeUtcAct();
		}
		else if (ruleParam->actualFdpCalcStart == "STANDBYDUTYSTART") {
			result = preRoster->getStartTimeUtcAct();
		}
	}

	return result;
}

//Duty是否在欧洲或美洲航线进行Layover
bool DutyUtils::IsLayoverInEUR(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
	return IsStationOfLongPerdiemRoutes(duty->getLastSegment()->getArrStationRead(), dbData);
}

bool DutyUtils::IsStationOfLongPerdiemRoutes(const string& station, const SharedPtr<CrewDataContext>& dbData) {
	auto iterAirport = dbData->airportCodeMap.find(station);
	if (iterAirport == dbData->airportCodeMap.end()) {
		return false;
	}
	auto& airport = iterAirport->second;
	auto iterRoutes = dbData->systemParamMap.find("LONG_PERDIEM_ROUTES");
	if (iterRoutes == dbData->systemParamMap.end()) {
		return false;
	}
	set<string> longPerdiemRoutes;
	split(iterRoutes->second.c_str(), ',', longPerdiemRoutes);
	if (std::find(longPerdiemRoutes.begin(), longPerdiemRoutes.end(), airport->icRoute) == longPerdiemRoutes.end()) {
		return false;
	}
	return true;
}

int DutyUtils::GetConsecutiveTimesWithCurrDuty(const Duty* prevDuty, const Duty* currDuty) {
	if (currDuty == nullptr) {
		return -1;
	}
	if (prevDuty == nullptr && currDuty != nullptr) {
		return 1;
	}
	time_t startLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevDuty->getEndTimeLocAct(), 0);
	time_t endLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currDuty->getStartTimeLocAct(), 0);
	int gap = (int)(endLocalDay - startLocalDay);
	if (gap == 0 || gap == 24 * 60 * 60) {
		//二个Roster连续
		return 1;
	}
	return -1;
}

int DutyUtils::GetConsecutiveDaysWithCurrDuty(const Duty* prevDuty, const Duty* currDuty) {
	if (currDuty == nullptr) {
		return -1;
	}
	int days = TimeUtils::DiffCalendarDay(currDuty->getStartTimeLocAct(), currDuty->getEndTimeLocAct());
	if (prevDuty == nullptr && currDuty != nullptr) {
		return days;
	}
	time_t startLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevDuty->getEndTimeLocAct(), 0);
	time_t endLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currDuty->getStartTimeLocAct(), 0);
	int gap = (int)(endLocalDay - startLocalDay);
	if (gap == 0) {
		return days - 1;
	}
	if (gap == 24 * 60 * 60) {
		return days;
	}
	return -1;
}

int DutyUtils::GetRestfacility(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
	bool separateRestFacility = false;//是否按CC或者FD拆分休息设施，true：拆分，false：不拆分
	auto iterParam = dbData->systemParamMap.find("SEPARATE_CC_REST_FACILITY");
	if (iterParam != dbData->systemParamMap.end()) {
		separateRestFacility = (strToUpper(iterParam->second) == "Y");
	}

	int restfacility = 9999;
	for (auto& segment : duty->getSegments())
	{
		string tailNumber = segment->getTailNum();
		int ii = 0;
		if (dbData->fltIdToAircraftMap.find(tailNumber) != dbData->fltIdToAircraftMap.end()) {
			DBAircraft* aircraft = dbData->fltIdToAircraftMap[tailNumber].get();
			if (aircraft->isExistRest) {
				if (separateRestFacility && dbData->scenario.division == "C") {
					ii = aircraft->ccRestFacility;
				}
				else {
					ii = aircraft->restFacility;
				}
			}
		}
		else if (dbData->fleetMap.find(segment->getFleetCD()) != dbData->fleetMap.end()) {
			FLEET fleet = dbData->fleetMap[segment->getFleetCD()];
			if (separateRestFacility && dbData->scenario.division == "C") {
				if (fleet.ccRestfacility > ii) {
					ii = fleet.ccRestfacility;
				}
			}
			else {
				if (fleet.restfacility > ii) {
					ii = fleet.restfacility;
				}
			}
		}

		if (dbData->subFleetMap.find(segment->getSubFleet()) != dbData->subFleetMap.end()) {
			SUB_FLEET subFleet = dbData->subFleetMap[segment->getSubFleet()];
			if (separateRestFacility && dbData->scenario.division == "C") {
				if (subFleet.ccRestFacility > ii) {
					ii = subFleet.ccRestFacility;
				}
			}
			else {
				if (subFleet.restFacility > ii) {
					ii = subFleet.restFacility;
				}
			}
		}

		if (ii < restfacility) restfacility = ii;
	}
	return restfacility;
}


//判断Duty是否是适应状态，true-适应状态,fase:非适应状态
bool DutyUtils::IsAcclimation(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
	bool result = false;
	//int application = RuleParams::GetInstancePtr()->getApplication();
	string accState = duty->getAcclimatisedState();

	if (dbData->scenario.airline == "QQ" || dbData->scenario.airline == "HX") {
		//QQ适应期法规6005
		return accState == AcclimatizationState::ACCLIMATIZED || accState == AcclimatizationState::INIT;
	}
	else {
		//EASA适应期法规7000
		return accState == AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT || accState == AcclimatizationStateOfEASA::ACCLIMATIZED_PREV;
	}
	return result;
}

bool DutyUtils::IsUnknownAcclimation(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
	bool result = false;
	string accState = duty->getAcclimatisedState();

	if (dbData->scenario.airline == "QQ") {
		//QQ适应期法规6005
		return accState == AcclimatizationState::UNKNOWN;
	}
	else {
		//EASA适应期法规7000
		return accState == AcclimatizationStateOfEASA::UNKNOWN;
	}
	return result;
}

int DutyUtils::GetDutyActualFDP(const Duty* duty, const ROSTER* roster) {
	if (duty == nullptr) {
		return 0;
	}
	if (roster == nullptr) {
		return duty->getActualFDP();
	}

	int dutyIndex = duty->getDutySeq() - 1;
	int mergeFDP = const_cast<ROSTER*>(roster)->dutyValues.getMergeFdp(dutyIndex);
	if (mergeFDP > 0) {
		return mergeFDP;
	}
	return duty->getActualFDP();
}

int DutyUtils::GetDutyActualDP(const Duty* duty, const ROSTER* roster) {
	if (duty == nullptr) {
		return 0;
	}
	if (roster == nullptr) {
		return duty->getActualDP();
	}

	int dutyIndex = duty->getDutySeq() - 1;
	int mergeDP = const_cast<ROSTER*>(roster)->dutyValues.getMergeDp(dutyIndex);
	if (mergeDP > 0) {
		return mergeDP;
	}
	return duty->getActualDP();
}


int DutyUtils::GetDutyActualBLH(const Duty* duty, const ROSTER* roster) {
	if (duty == nullptr) {
		return 0;
	}
	if (roster == nullptr) {
		return duty->getActualBlockTime();
	}

	int dutyIndex = duty->getDutySeq() - 1;
	int mergeBLH = const_cast<ROSTER*>(roster)->dutyValues.getMergeBlh(dutyIndex);
	if (mergeBLH > 0) {
		return mergeBLH;
	}
	return duty->getActualBlockTime();
}

void TestGetLocalNightNums() {
	//1762915200: 2025/11/12 2:40:00  时间UTC+0
	//1763091000: 2025/11/14 3:30:00  时间UTC+0
	//1762908600: 2025/11/12 0:50:00  时间UTC+0
	//1763098200: 2025/11/14 5:30:00  时间UTC+0
	assert(DutyUtils::GetLocalNightNums(1762915200, 1763091000, 0, "22:00", "08:00", "08:00") == 1);
	assert(DutyUtils::GetLocalNightNums(1762908600, 1763098200, 0, "22:00", "08:00", "08:00") == 1);

	//1702209600: 2023-12-10 20:00:00 北京时间UTC+8
	//1702213200: 2023-12-10 21:00:00 北京时间UTC+8
	//1702216800: 2023-12-10 22:00:00 北京时间UTC+8
	//1702242000: 2023-12-11 05:00:00 北京时间UTC+8
	//1702252800: 2023-12-11 08:00:00 北京时间UTC+8
	assert(DutyUtils::GetLocalNightNums(1702213200, 1702213200, 480, "22:00", "05:00", "08:00") == 0);
	assert(DutyUtils::GetLocalNightNums(1702213200, 1702242000, 480, "22:00", "05:00", "08:00") == 1);
	assert(DutyUtils::GetLocalNightNums(1702213200, 1702242000 - 1, 480, "22:00", "05:00", "08:00") == 0);
	assert(DutyUtils::GetLocalNightNums(1702213200, 1702252800, 480, "22:00", "05:00", "08:00") == 1);
	assert(DutyUtils::GetLocalNightNums(1702213200 + 1, 1702252800, 480, "22:00", "05:00", "08:00") == 1);
	assert(DutyUtils::GetLocalNightNums(1702213200 + 1, 1702252800 + 24 * 60 * 60 * 3, 480, "22:00", "05:00", "08:00") == 4);
	assert(DutyUtils::GetLocalNightNums(1702213200 + 1, 1702252800 + 24 * 60 * 60 * 3 - 1, 480, "22:00", "05:00", "08:00") == 4);
	assert(DutyUtils::GetLocalNightNums(1702209600, 1702242000 - 1, 480, "22:00", "05:00", "08:00") == 0);

	assert(DutyUtils::GetLocalNightNums(1702213200, 1702213200, 480, "22:00", "08:00", "08:00") == 0);
	assert(DutyUtils::GetLocalNightNums(1702213200, 1702242000, 480, "22:00", "08:00", "08:00") == 0);
	assert(DutyUtils::GetLocalNightNums(1702213200, 1702252800, 480, "22:00", "08:00", "08:00") == 1);
	assert(DutyUtils::GetLocalNightNums(1702213200 + 1, 1702252800 + 24 * 60 * 60 * 3, 480, "22:00", "08:00", "08:00") == 4);
	assert(DutyUtils::GetLocalNightNums(1702213200 + 1, 1702252800 + 24 * 60 * 60 * 3 - 1, 480, "22:00", "08:00", "08:00") == 4);
}
