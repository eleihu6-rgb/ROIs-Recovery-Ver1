#pragma once

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
// #include "customBiz\customBiz.h"
#include "CustomBiz/CustomBiz.h"
#include "../utils/StringUtils.h"

bool LegalityChecker::checkMaxFlightDutyPeriodCabinNew(Duty* duty, const vector<DBRule>& singleRules){
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
		rule2130* cache = (rule2130*)singleRule.parsedParam.get();

		string header, headeValue;
		string composition, division;
		int checkMaxFdp = 0, checkMaxExtension = 0,crewNums = 0;
		checkMaxFdp = cache->maxFdp;
		checkMaxExtension = cache->maxExtension;
		vector<string> strFleets = cache->fleetsVec;
		composition = cache->composition;
		crewNums = cache->crewNums;
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
		//crewnum = 0;
		//if (!isPo){
		//	crewnum = getCrewNumsByDuty(duty, division);
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
					string msg= "A: Duty ID {0:dutyId} From {1:startTime} to {2:endTime}: \
						The Flight Duty Period exceeds the limitation {3:maxFdp} but is within the extension limitation {4:maxFdpMaxExtension}.";
					errorMsga = StringUtils::Format(msg, duty->getDutyId(), 
						utcToUtcString(duty->getStartTime()), utcToUtcString(duty->getEndTime()), 
						Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60),
						Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60));

					maxFdp = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60);
					maxFdpMaxExtension = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					ruleId = "2130.1";
				}
				else if (division == "C"){
					string msg = "C: Duty ID {0:dutyId} From {1:startTime} to {2:endTime}: \
						The Flight Duty Period exceeds the limitation {3:maxFdp} but is within the extension limitation {4:maxFdpMaxExtension}.";
					errorMsgc = StringUtils::Format(msg, duty->getDutyId(),
						utcToUtcString(duty->getStartTime()), utcToUtcString(duty->getEndTime()),
						Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60),
						Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60));
					maxFdp = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60);
					maxFdpMaxExtension = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					ruleId = "2130.2";
				}
			}
			else{
				if (division == "A"){
					//20190527 ain, mantis#5761, 避免字符串拼接出现 char* + int计算
					string msg = "A: Duty ID {0:dutyId} From {1:startTime} to {2:endTime}: \
						The Flight Duty Period exceeds the extension limitation {3:maxFdpMaxExtension}.";
					errorMsga = StringUtils::Format(msg, duty->getDutyId(),
						utcToUtcString(duty->getStartTime()), utcToUtcString(duty->getEndTime()),
						Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60));
					maxFdp = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60);
					maxFdpMaxExtension = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					ruleId = "2130.3";
				}
				else if (division == "C"){
					//20190527 ain, mantis#5761, 避免字符串拼接出现 char* + int计算
					string msg = "C: Duty ID {0:dutyId} From {1:startTime} to {2:endTime}: \
						The Flight Duty Period exceeds the extension limitation {3:maxFdpMaxExtension}.";
					errorMsgc = StringUtils::Format(msg, duty->getDutyId(),
						utcToUtcString(duty->getStartTime()), utcToUtcString(duty->getEndTime()),
						Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60));
					maxFdp = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp) / 60);
					maxFdpMaxExtension = Utility::GetInstancePtr()->formatMinutes((checkMaxFdp + checkMaxExtension) / 60);
					ruleId = "2130.4";
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
			string msg = "A: Duty ID {0:dutyId} From {1:startTime} to {2:endTime}: The Fleet, Crew Composition, and Flight Duty Period do not match.";
			errorMsga = StringUtils::Format(msg, duty->getDutyId(),
				utcToUtcString(duty->getStartTime()), utcToUtcString(duty->getEndTime()));
			ruleId = "2130.5";
		}
		if (!isMatchC){
			//20190527 ain, mantis#5761, 避免字符串拼接出现 char* + int计算
			string msg = "C: Duty ID {0:dutyId} From {1:startTime} to {2:endTime}: The Fleet, Crew Composition, and Flight Duty Period do not match.";
			errorMsga = StringUtils::Format(msg, duty->getDutyId(),
				utcToUtcString(duty->getStartTime()), utcToUtcString(duty->getEndTime()));
			ruleId = "2130.6";
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

int LegalityChecker::getCrewNumsByDuty(Duty* duty, std::string division){
	int crewNums = 0;

	Segment *s = duty->getFirstFlySegment();
	if (s == nullptr) {
		s = duty->getSegment(0);
	}
	vector<SharedPtr<RosterFlight>> rfs = this->_dbData->rosterFlightMgr.get(s->getDBId());
	for (auto rf : rfs){
		if ((rf->division == division || division == "*") && this->_dbData->rankMap.find(rf->actingRank) != this->_dbData->rankMap.end()){
			if (this->_dbData->rankMap[rf->actingRank].isIncludeInFt){
				crewNums++;
			}
		}
	}
	return crewNums;
}