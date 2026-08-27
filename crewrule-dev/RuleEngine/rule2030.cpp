#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "CustomBiz/CustomBiz.h"
// #include "customBiz/customBiz.h"


//2030 duty
bool LegalityChecker::checkMaxFlightDutyPeriodCabin(Duty* duty, const vector<DBRule>& singleRules){
	//mantis#5520
	if (duty->getPairingId() != NULL
		&&this->_dbData->pairingIdMap[duty->getPairingId()] != NULL
		&&this->_dbData->isAssignmentInGroup(this->_dbData->pairingIdMap[duty->getPairingId()]->getPrimeActivity(), "SBY")){
		return true;
	}

	if (duty->getNumFlySegs() == 0) {
		return true;
	}
	if (duty->getNumSegments() == 1){
		Segment* s = duty->getSegment(0);
		if (!s->getIsOperating() || s->getAssignment() == "DHD" || s->getAssignment() == "BUS" || s->getAssignment() == "PSG")
			return true;
	}
	bool bReturnA = false;
	bool bReturnC = false;
	bool isMatchA = false;
	bool isMatchC = false;
	bool checkA = false;
	bool checkC = false;
	string errorMsga = "";
	string errorMsgc = "";
	string dutyAbbr = getDutyAbbr(duty);
	string ruleId = "";
	string maxFdp, maxFdpMaxExtension;
	bool isPo = this->GetApplication() == PAIRING_OPTIMIZER;

	//mantis#9392 检查ptn composition中是否包含C/A的rank
	//如果C/A有一个没有，法规参数循环根据division直接continue
	RankDivision ptnRankDiv;
	if (isPo) {
		if (this->_dbData->scenario.division == "C")
			ptnRankDiv.hasC = true;
		if (this->_dbData->scenario.division == "P")
			ptnRankDiv.hasP = true;
	}
	else
		ptnRankDiv = this->_dbData->getPairingRankDivision(duty->getPairingId());

	bool ptnHasA = ptnRankDiv.hasA;
	bool ptnHasC = ptnRankDiv.hasC;
	
	for (auto singleRule : singleRules){
		rule2030_2* cache = (rule2030_2*)singleRule.parsedParam.get();

		string header, headeValue;
		string composition, division;
		int checkMaxFdp = 0, checkMaxExtension = 0;
		checkMaxFdp = cache->maxFdp;
		checkMaxExtension = cache->maxExtension;
		vector<string> strFleets = cache->fleetsVec;
		composition = cache->composition;
		division = cache->division;
		if (division == "A")checkA = true;
		if (division == "C")checkC = true;

		if ((checkA && !ptnHasA) || (checkC && !ptnHasC)) {
			isMatchA = bReturnA = true;
			isMatchC = bReturnC = true;
			continue;
		}
		//20190529 ain, mantis#5584, 重构, 统一FDP计算流程为 customBiz.calculatePairingDutyTimes
		calculatePairingDutyTimes(duty, this->_dbData.get());
		//CalculationManday FDP = this->_dbData->calculationMandayMap["FDP"];
		//CalculationManday ACT_FDP = this->_dbData->calculationMandayMap["ACT FDP"];
		//duty->calculateFDP(0, FDP.str, FDP.end);
		//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);
		long fdp = duty->getFDPInSecs();

		string fleet = duty->getFltCD();
		string compName = "";
		if (!isPo) {
			compName = getCompositionByDuty(duty, division);
			if (compName == "divisionAture") {
				isMatchA = bReturnA = true;
			}
			if (compName == "divisionCture") {
				isMatchC = bReturnC = true;
			}
		}
		else
			compName = duty->getCompositionName();
		//string compName = duty->getCompositionName();
		//if (compName == "")
		//{
		//	compName = getCompositionByRanks(duty);
		//	duty->setCompositionName(compName);
		//}
		bool isFleetMatch = (std::find(strFleets.begin(), strFleets.end(), fleet) != strFleets.end() || strFleets[0] == "*");
		//if (isPo&&isFleetMatch || (!isPo && isFleetMatch && compName == composition)){
		if ( isFleetMatch && compName == composition) {
			if (division == "A"){
				isMatchA = true;
			}
			else if (division == "C"){
				isMatchC = true;
			}
			if (fdp <= checkMaxFdp){
				if (division == "A"){
					bReturnA = true;
				}
				else if (division == "C"){
					bReturnC = true;
				}
			}
			else if (fdp <= checkMaxFdp + checkMaxExtension){
				if (division == "A"){
					stringstream ss;
					ss << "A: Duty " << duty->getDutyId();
					ss << " from " << utcToUtcString(duty->getStartTime());
					ss << " to " << utcToUtcString(duty->getEndTime());
					ss << " The Flight Duty Period exceeds the limitation " + Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60);
					ss << " but is within the extension limitation " + Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					errorMsga = ss.str();
					maxFdp = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60);
					maxFdpMaxExtension = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					ruleId = "2030.1";
				}
				else if (division == "C"){
					stringstream ss;
					ss << "C: Duty " << duty->getDutyId();
					ss << " From " << utcToUtcString(duty->getStartTime());
					ss << " to " + utcToUtcString(duty->getEndTime());
					ss << " The Flight Duty Period exceeds the limitation " + Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60);
					ss << " but is within the extension limitation " + Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					errorMsgc = ss.str();
					maxFdp = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60);
					maxFdpMaxExtension = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					ruleId = "2030.2";
				}
			}
			else{
				if (division == "A"){
					//20190527 ain, mantis#5761, 避免字符串拼接出现 char* + int计算
					stringstream ss;
					ss << "A: Duty " << duty->getDutyId();
					ss << " from " << utcToUtcString(duty->getStartTime());
					ss << " to " << utcToUtcString(duty->getEndTime());
					ss << " The Flight Duty Period exceeds the limitation " + Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					errorMsga = ss.str();
					maxFdp = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60);
					maxFdpMaxExtension = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					ruleId = "2030.3";
				}
				else if (division == "C"){
					//20190527 ain, mantis#5761, 避免字符串拼接出现 char* + int计算
					stringstream ss;
					ss << "C: Duty " << duty->getDutyId();
					ss << " from " << utcToUtcString(duty->getStartTime());
					ss << " to " + utcToUtcString(duty->getEndTime());
					ss << " The Flight Duty Period exceeds the limitation " + Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					errorMsgc = ss.str();
					maxFdp = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60);
					maxFdpMaxExtension = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					ruleId = "2030.4";
				}
			}
		}
	}
	if (!checkA){
		isMatchA = bReturnA = true;
	}
	if (!checkC){
		isMatchC = bReturnC = true;
	}
	if (!(bReturnA&&bReturnC)){

		if (this->GetApplication() == ROSTER_OPTIMIZER || this->GetApplication() == PAIRING_OPTIMIZER){
			return false;
		}
		string errorMsg = "";
		if (!isMatchA){
			//20190527 ain, mantis#5761, 避免字符串拼接出现 char* + int计算
			stringstream ss;
			ss << "A: Duty " << duty->getDutyId();
			ss << " from " << utcToUtcString(duty->getStartTime());
			ss << " to " << utcToUtcString(duty->getEndTime());
			ss << " The Fleet, Crew Composition, and Flight Duty Period do not match.";
			errorMsga = ss.str();
			ruleId = "2030.5";
		}
		if (!isMatchC){
			//20190527 ain, mantis#5761, 避免字符串拼接出现 char* + int计算
			stringstream ss;
			ss << "C: Duty " << duty->getDutyId();
			ss << " from " << utcToUtcString(duty->getStartTime());
			ss << " to " << utcToUtcString(duty->getEndTime());
			ss << " The Fleet, Crew Composition, and Flight Duty Period do not match.";
			errorMsga = ss.str();
			ruleId = "2030.6";
		}
		errorMsg = errorMsga + " " + errorMsgc;
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->idRule = singleRules[0].idRule;
		rv->pairingId = duty->getPairingId();
		rv->dutySequenceNumber = duty->getDutySegNum();
		rv->startDTUtc = duty->getStartTimeUtcAct();
		rv->endDTUtc = duty->getEndTimeUtcAct();
		rv->violation_msg = errorMsg;
		rv->operation_result.insert(pair<string, string>("ruleId", ruleId));
		rv->operation_result.insert(pair<string, string>("dutyAbbr", dutyAbbr));
		rv->operation_result.insert(pair<string, string>("startTime", utcToUtcString(duty->getStartTime())));
		rv->operation_result.insert(pair<string, string>("endTime", utcToUtcString(duty->getEndTime())));
		rv->operation_result.insert(pair<string, string>("maxFdp", maxFdp));
		rv->operation_result.insert(pair<string, string>("maxFdpMaxExtension", maxFdpMaxExtension));
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
		this->addRuleViolations(rv, NULL);//20190527 ain, 补齐逻辑 rv加入结果
	}

	return bReturnA&&bReturnC;
}


string LegalityChecker::getCompositionByDuty(Duty* duty, string division) {
	if (this->_dbData->version == 3) return this->getCompositionByDutyFor3(duty, division);
	string compName;
	long long compid = -9999;
	int hierarchy = 999999;
	for (std::size_t i = 0; i < duty->getNumSegments(); i++) {
		Segment* s = duty->getSegment(i);
		if (!s->getIsOperating() || s->getAssignment() == "DHD" || s->getAssignment() == "BUS") {
			continue;
		}
		long long fltId = s->getDBId();
		if (this->_dbData->flightIdToPairing.find(fltId) == this->_dbData->flightIdToPairing.end()) {
			Logger::getRuleLogger()->error("[LegalityChecker::getCompositionByDuty] flightIdToPairing[{}] is null. pairingId={}, dutyId={}", fltId, duty->getPairingId(), duty->getDutyId());
			continue;
		}
		map<string, int> rankMap;
		for (std::size_t j = 0; j < this->_dbData->flightIdToPairing[fltId].size(); j++){
			long long id = this->_dbData->flightIdToPairing[fltId][j];
			map<string, int>::iterator iter;
			if (this->_dbData->pairingIdMap.find(id) != this->_dbData->pairingIdMap.end()){
				iter = this->_dbData->pairingIdMap[id]->getComplements().begin();
				while (iter != this->_dbData->pairingIdMap[id]->getComplements().end()){
					if (this->_dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")){
						iter++;
						continue;
					}
					if (this->_dbData->rankMap[iter->first].division == division || division == ""){
						rankMap[iter->first] += iter->second;
					}
					iter++;
				}
			}
		}
		if (rankMap.size() == 0 && division == ""){
			return "";
		}
		if (rankMap.size() == 0){
			return "division" + division + "ture";
		}
		unordered_map<long long, composition_rank>::iterator compIter;
		map<string, int>::iterator rankIter;
		compIter = this->_dbData->compositionRankMap.begin();
		while (compIter != this->_dbData->compositionRankMap.end()){
			bool isOk = false;
			int iCount = 0;
			int k = -1;
			if (compIter->second.rankCount == rankMap.size()){
				for (k = 0; k < compIter->second.rankCount; k++){
					string rank = compIter->second.rankValue[k].rank;
					if (rank == ""){
						continue;
					}
					if (rankMap.find(rank) != rankMap.end() && rankMap[rank] == compIter->second.rankValue[k].plan_value){
						iCount++;
					}
					else{
						break;
					}
				}
			}
			if (iCount == rankMap.size() && k >= compIter->second.rankCount){
				isOk = true;
				if (hierarchy > compIter->second.hierarchy){
					compid = compIter->second.comp_id;
					hierarchy = compIter->second.hierarchy;
				}
				break;
			}
			compIter++;
		}
	}
	for (auto composition : this->_dbData->compositionList){
		if (composition.getCompositionId() == compid){
			compName = composition.getName();
			break;
		}
	}

	return compName;
}

string LegalityChecker::getCompositionByDutyFor3(Duty* duty, string division) {
	//获取不到配比，默认配比处理方式 取值：MIN - 最小配比、FLT - 获得航班， NA - 返回空配比
	string defaultCompositionMode = _dbData->getSystemParamValue("DEFAULT_COMPOSITION_MODE", "FLT");

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
		
		if (this->_dbData->flightIdToPairing.find(fltId) == this->_dbData->flightIdToPairing.end()) {
			Logger::getRuleLogger()->error("[LegalityChecker::GetCompositionByDutyFor3] flightIdToPairing[{}] is null. pairingId={}, dutyId={}", fltId, duty->getPairingId(), duty->getDutyId());
			continue;
		}

		//rankMap由Pairing改成通过Flight获取，原因：横切后Pairing的Complements不完整，会导致无法找到配比
		//方法1：通过Pairing寻找RankMap
		for (std::size_t j = 0; j < this->_dbData->flightIdToPairing[fltId].size(); j++) {
			long long id = this->_dbData->flightIdToPairing[fltId][j];
			map<string, int>::iterator iter;
			if (this->_dbData->pairingIdMap.find(id) != this->_dbData->pairingIdMap.end()) {
				iter = this->_dbData->pairingIdMap[id]->getComplements().begin();
				while (iter != this->_dbData->pairingIdMap[id]->getComplements().end()) {
					if (this->_dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
						iter++;
						continue;
					}
					if ((this->_dbData->rankMap[iter->first].division == division || division == "") && this->_dbData->rankMap[iter->first].isMustCrewRank) {
						rankMap[iter->first] += iter->second;
					}
					iter++;
				}
			}
		}
		//方法2：通过Flight寻找RankMap，见方法：getCompositionByDutySegmentFor3()
		//auto iterFlight = this->_dbData->flightIdMap.find(fltId);
		//if (iterFlight != this->_dbData->flightIdMap.end()) {
		//	auto iter = iterFlight->second->getPlanComposition().begin();
		//	while (iter != iterFlight->second->getPlanComposition().end()) {
		//		if (this->_dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
		//			iter++;
		//			continue;
		//		}
		//		if ((this->_dbData->rankMap[iter->first].division == division || division == "") && this->_dbData->rankMap[iter->first].isMustCrewRank) {
		//			rankMap[iter->first] += iter->second;
		//		}
		//		iter++;
		//	}
		//}
		matched = true;
		if (rankMap.size() == 0 && division == "") {
			return "";
		}
		if (rankMap.size() == 0) {
			return "";
		}
		unordered_map<long long, unordered_map<int, composition_rank>>::iterator compIter;
		unordered_map<int, composition_rank>::iterator optionIter;
		map<string, int>::iterator rankIter;
		compIter = this->_dbData->compositionRankOptionMap.begin();
		while (compIter != this->_dbData->compositionRankOptionMap.end()) {
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
	for (auto& composition : this->_dbData->compositionList) {
		if (composition.getCompositionId() == compid) {
			compName = composition.getName();
			break;
		}
	}

	//通过Flight的Pairing._complements 无法找到Duty配比，此时才使用默认配比。针对Pairing配比为OVER:1，Duty配比仍然返回空
	if (matched && compName.empty()) {
		if (defaultCompositionMode == "FLT") {
			return getCompositionByDutySegmentFor3(duty, division);
		}
		else {
			return _dbData->getDefaultComposition(defaultCompositionMode);
		}
	}
	return compName;
}

string LegalityChecker::getCompositionByDutySegmentFor3(Duty* duty, string division) {
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
		auto iterFlight = this->_dbData->flightIdMap.find(fltId);
		if (iterFlight != this->_dbData->flightIdMap.end()) {
			if (iterFlight->second == nullptr) {
				Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, flight do not exist. FlightId:{}, PairingId:{}, DutyId:{}, method=getCompositionByDutySegmentFor3", fltId, s->getPairingId(), s->getDutyId());
			}
			else {
				auto iter = iterFlight->second->getPlanComposition().begin();
				while (iter != iterFlight->second->getPlanComposition().end()) {
					if (this->_dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
						iter++;
						continue;
					}
					if ((this->_dbData->rankMap[iter->first].division == division || division == "") && this->_dbData->rankMap[iter->first].isMustCrewRank) {
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
		compIter = this->_dbData->compositionRankOptionMap.begin();
		while (compIter != this->_dbData->compositionRankOptionMap.end()) {
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
	for (auto& composition : this->_dbData->compositionList) {
		if (composition.getCompositionId() == compid) {
			compName = composition.getName();
			break;
		}
	}

	return compName;
}

string LegalityChecker::getCompositionByPairing(Pairing* pairing){
	string compName = "";
	int hierarchy = 0;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++){
		Duty* duty = pairing->getDuty(i);
		string dutyComp = this->getCompositionByDuty(duty);
		if (compName == ""){
			compName = dutyComp;
			for (auto& composition : _dbData->compositionList){
				if (composition.getName() == compName){
					hierarchy = composition.getHierarchy();
					break;
				}
			}
		}
		else{
			for (auto& composition : _dbData->compositionList){
				if (composition.getName() == compName&&composition.getHierarchy() > hierarchy){
					hierarchy = composition.getHierarchy();
					compName = dutyComp;
				}
			}
		}
	}
	return compName;
}

bool LegalityChecker::getIsAugment_2030(Duty* duty, string Division){
	bool isAugment = false;
	auto& singleRules = _dbData->getRuleFunctions(RULES::MAX_FLIGHT_DUTY_PERIOD_CABIN);
	bool isPo = this->GetApplication() == PAIRING_OPTIMIZER;
	for (auto singleRule : singleRules){
		rule2030_2* cache = (rule2030_2*)singleRule.parsedParam.get();
		string header, headeValue;
		string composition, division;		
		long long checkMaxFdp = 0;
		checkMaxFdp = cache->maxFdp;
		vector<string> strFleets = cache->fleetsVec;
		composition = cache->composition;
		division = cache->division;
		isAugment = cache->isAugment;
		if (Division != division){ continue; }
		CalculationManday FDP = this->_dbData->getCalculationManday("FDP");
		CalculationManday ACT_FDP = this->_dbData->getCalculationManday("ACT FDP");
		//duty->calculateFDP(0, FDP.str, FDP.end);
		//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);
		long fdp = duty->getFDPInSecs();

		string fleet = duty->getFltCD();
		bool isFleetMatch = (std::find(strFleets.begin(), strFleets.end(), fleet) != strFleets.end() || strFleets[0] == "*");
		if (!isFleetMatch)
			continue;
		if (fdp > checkMaxFdp)
			continue;
		return isAugment;
	}
	return isAugment;
}


string LegalityChecker::getDutyAbbr(Duty* d){
	string ss = "";
	for (std::size_t i = 0;i< d->getSegments().size();i ++){
 		Segment*s = d->getSegment(i);
		ss += this->_dbData->airportCodeMap[s->getDepStation()]->airportABBR;
		ss += "/";
		if (i == d->getSegments().size() - 1){
			ss += this->_dbData->airportCodeMap[s->getArrStation()]->airportABBR;
		}
	}
	return ss;
};

void LegalityChecker::setDutyDiscretion_2030(Duty * duty){
	//mantis#5520
	if (duty->getPairingId() != NULL
		&&this->_dbData->pairingIdMap[duty->getPairingId()] != NULL
		&&this->_dbData->isAssignmentInGroup(this->_dbData->pairingIdMap[duty->getPairingId()]->getPrimeActivity(), "SBY")){
		return;
	}
	if (duty->getNumFlySegs() == 0) {
		return;
	}
	if (duty->getNumSegments() == 1){
		Segment* s = duty->getSegment(0);
		if (!s->getIsOperating() || s->getAssignment() == "DHD" || s->getAssignment() == "BUS" || s->getAssignment() == "PSG")
			return;
	}
	auto& dutyBuilder = _dbData->getRuleFunctions(RULES::MAX_FLIGHT_DUTY_PERIOD_CABIN);

	//20210720 ain, mantis#9392, fdpDiscretion计算增加ruleParam.division过滤
	RankDivision ptnRankDiv = this->_dbData->getPairingRankDivision(duty->getPairingId());

	string maxFdp, maxFdpMaxExtension;
	bool isPo = this->GetApplication() == PAIRING_OPTIMIZER;
	for (auto singleRule : dutyBuilder){
		rule2030_2* cache = (rule2030_2*)singleRule.parsedParam.get();
		if (! ptnRankDiv.has(cache->division)) {
			continue;//20210720 ain, mantis#9392, fdpDiscretion计算增加ruleParam.division过滤
		}

		string header, headeValue;
		string composition, division;
		int checkMaxFdp = 0, checkMaxExtension = 0;
		checkMaxFdp = cache->maxFdp;
		checkMaxExtension = cache->maxExtension;
		vector<string> strFleets = cache->fleetsVec;
		composition = cache->composition;
		division = cache->division;

		//20190529 ain, mantis#5584, 重构, 统一FDP计算流程为 customBiz.calculatePairingDutyTimes
		calculatePairingDutyTimes(duty, this->_dbData.get());
		//CalculationManday FDP = this->_dbData->calculationMandayMap["FDP"];
		//CalculationManday ACT_FDP = this->_dbData->calculationMandayMap["ACT FDP"];
		//duty->calculateFDP(0, FDP.str, FDP.end);
		//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);
		long fdp = duty->getFDPInSecs();

		string fleet = duty->getFltCD();
		string compName = "";
		if (!isPo){
			compName = getCompositionByDuty(duty, division);
		}
		//string compName = duty->getCompositionName();
		//if (compName == "")
		//{
		//	compName = getCompositionByRanks(duty);
		//	duty->setCompositionName(compName);
		//}
		bool isFleetMatch = (std::find(strFleets.begin(), strFleets.end(), fleet) != strFleets.end() || strFleets[0] == "*");
		if (isPo&&isFleetMatch || (!isPo && isFleetMatch && compName == composition)){
			/*if (fdp > checkMaxFdp){
				duty->setFdpDiscretion((fdp - checkMaxFdp) / 60);
			}
			else{
				duty->setFdpDiscretion(0);
			}*/
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, checkMaxFdp / 60, singleRule.idRule, singleRule.idRuleParam, singleRule.overridebility, singleRule.classType, singleRule.description, singleRule.reference);
		}
	}
}
