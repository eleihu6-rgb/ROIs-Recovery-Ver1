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
#include "../utils/StringUtils.h"

static const int SecondsInDay = 3600 * 24;

namespace {
std::string buildExceededMsg(const std::string& subject, const std::string& actual, const std::string& limit) {
	return subject + " exceeds the limit (actual=" + actual + ", limit=" + limit + ").";
}

bool containsToken(const std::vector<std::string>& tokens, const std::string& valueUpper) {
	return std::find(tokens.begin(), tokens.end(), valueUpper) != tokens.end();
}

bool pairingMatchesFleetFilters(const std::vector<Duty*>& duties,
								const std::vector<std::string>& fleets,
								const std::vector<std::string>& fleetGroups,
								const CrewDataContext* dbData) {
	if (fleets.empty() && fleetGroups.empty()) {
		return true;
	}

	for (const auto* duty : duties) {
		if (duty == nullptr) {
			continue;
		}
		for (const auto* seg : duty->getSegmentsRead()) {
			if (seg == nullptr || !seg->getIsOperating()) {
				continue;
			}

			const std::string fleetUpper = seg->getFleetCD();
			if (!fleets.empty()) {
				if (fleetUpper.empty() || !containsToken(fleets, fleetUpper)) {
					return false;
				}
			}

			if (!fleetGroups.empty()) {
				if (dbData == nullptr) {
					return false;
				}
				const auto fleetIt = dbData->fleetMap.find(seg->getFleetCD());
				if (fleetIt == dbData->fleetMap.end()) {
					return false;
				}
				const std::string fleetGroupUpper = strToUpper(trim(fleetIt->second.fleetGrp));
				if (fleetGroupUpper.empty() || !containsToken(fleetGroups, fleetGroupUpper)) {
					return false;
				}
			}
		}
	}

	return true;
}
}  // namespace

// rule server和优化调用2003的统一实现
bool LegalityChecker::checkPairingLimitationImplemenation(const vector<Duty *>& duties, const DBRule* singleRule, Pairing* pPairing) {
	bool bReturn = true;
	rule2003* cache = (rule2003*)singleRule->parsedParam.get();
	if (duties.empty()) {
		return true;
	}

	string base = cache->base;
	int iPgLen = cache->maxPgLength;
	int iMaxDuties = cache->maxDutiesinPG;
	string allowReturnBaseinDuty = cache->allowReturnBaseinDuty;
	string strmaxBlh = cache->maxBlh;
	string strMaxDays = cache->strMaxDays;
	vector<string>& stations = cache->allowableLayoverStation;
	const vector<string>& fleets = cache->fleets;
	const vector<string>& fleetGroups = cache->fleetGroups;

	int maxDays = 9999;
	if (strMaxDays != "") {
		maxDays = stoi(strMaxDays);
	}
	int maxBlh = hhmmToMinutes(strmaxBlh.c_str());

	string pairingBase;
	if (pPairing) 
		pairingBase = pPairing->getBase();
	else
		pairingBase = duties.front()->getDepStation();
	int dutyNum = (int)duties.size();
	if (pPairing && pPairing->getPrimeActivity() != "FLY" && pPairing->getPrimeActivity() != "MVO")
		return true;
	if (!pairingMatchesFleetFilters(duties, fleets, fleetGroups, this->_dbData.get())) {
		return true;
	}
	if ((base == "*" || base == pairingBase) && dutyNum > 0) {
		const string effectiveBase = (base == "*") ? pairingBase : base;
		int blh = 0;
		auto firstDuty = duties.front();
		auto lastDuty = duties.back();

		// 使用pickup/dropoff时间
		auto pairingStartTime = firstDuty->getStartTimeUtcAct() - firstDuty->getActualPickupMin() * 60;
		auto pairingEndTime = lastDuty->getEndTimeUtcAct() + lastDuty->getActualDropoffMin() * 60;

		for (auto d : duties) {
			blh += d->getBLKInMins();
		}
		//pPairing->getBLKInSec() / 60;

		double length = (pairingEndTime - pairingStartTime) / (60.0 * 60.0);

		//int iPgLen = stoi(maxPgLength);
		//int iMaxDuties = stoi(maxDutiesinPG);
		//auto offsetMinutes = this->getDataContext()->getAirportOffsetMinutes(base);
		//落地日期-开始日期+1<=参数设置。取主base时间模式。
		int days = 0;
		if (strMaxDays != "") {
			auto pairingStartTimeLocal = firstDuty->getStartTimeLocAct() - firstDuty->getActualPickupMin() * 60;
			auto pairingEndTimeLocal = lastDuty->getEndTimeLocAct() + lastDuty->getActualDropoffMin() * 60;

			days = static_cast<int>(pairingEndTimeLocal / SecondsInDay - pairingStartTimeLocal / SecondsInDay + 1);

		}
		if (blh > maxBlh)
		{
			if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
				return false;
			bReturn = false;
			std::string errorMsg = "Illegal Pairing: " + buildExceededMsg("The pairing block hours",
				Utility::GetInstancePtr()->formatMinutes(blh), strmaxBlh);
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			//rv->rosterId = (*it_roster)->rosterId;
			rv->pairingId = pPairing->getDbId();
			//rv->dutySequenceNumber = duty->getDutySegNum();
			//rv->segmentId = current->getDBId();
			rv->startDTUtc = pPairing->getStartTimeUtc();
			rv->endDTUtc = pPairing->getEndTimeUtc();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("ruleId", "2003.1"));
			rv->operation_result.insert(pair<string, string>("strmaxBlh", strmaxBlh));
			rv->operation_result.insert(pair<string, string>("actualBlh", Utility::GetInstancePtr()->formatMinutes(blh)));
			rv->violation_msg = errorMsg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER) {
				return false;
			}

		}

		if (length > iPgLen)
		{
			if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
				return false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			bReturn = false;

			const int lengthMinutes = static_cast<int>((pairingEndTime - pairingStartTime) / 60);
			const std::string actualLength = Utility::GetInstancePtr()->formatMinutes(lengthMinutes);
			const std::string limitLength = Utility::GetInstancePtr()->formatMinutes(iPgLen * 60);

			stringstream errorMsg;
			rv->operation_result.insert(pair<string, string>("ruleId", "2003.2"));
			errorMsg << "Illegal Pairing: " << buildExceededMsg("The pairing length", actualLength, limitLength);
			//setLegalityMessage(pPairing, singleRule, errorMsg);

			//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			//rv->rosterId = (*it_roster)->rosterId;
			rv->pairingId = pPairing->getDbId();
			//rv->dutySequenceNumber = duty->getDutySegNum();
			//rv->segmentId = current->getDBId();
			rv->startDTUtc = pPairing->getStartTimeUtc();
			rv->endDTUtc = pPairing->getEndTimeUtc();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			//OP#1448提供message参数给gantt
			string strMaxPgLength = intToStr(cache->maxPgLength);
			rv->operation_result.insert(pair<string, string>("maxPgLength", strMaxPgLength));
			rv->operation_result.insert(pair<string, string>("actualPairingLength", actualLength));
			rv->operation_result.insert(pair<string, string>("limitPairingLength", limitLength));
			rv->violation_msg = errorMsg.str();
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER) {
				return false;
			}
		}
		if (dutyNum > iMaxDuties)
		{
			if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
				return false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			bReturn = false;

			const std::string actualDutyCount = Utility::GetInstancePtr()->iToa(dutyNum);
			const std::string limitDutyCount = Utility::GetInstancePtr()->iToa(iMaxDuties);

			stringstream errorMsg;
			rv->operation_result.insert(pair<string, string>("ruleId", "2003.3"));
			errorMsg << "Illegal Pairing: " << buildExceededMsg("The number of duties in the pairing", actualDutyCount, limitDutyCount);

			rv->pairingId = pPairing->getDbId();
			rv->startDTUtc = pPairing->getStartTimeUtc();
			rv->endDTUtc = pPairing->getEndTimeUtc();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			string strMaxDutiesinPG = intToStr(cache->maxDutiesinPG);
			rv->operation_result.insert(pair<string, string>("maxDutiesinPG", strMaxDutiesinPG));
			rv->operation_result.insert(pair<string, string>("actualDutyCount", actualDutyCount));
			rv->operation_result.insert(pair<string, string>("limitDutyCount", limitDutyCount));
			rv->violation_msg = errorMsg.str();
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER) {
				return false;
			}
		}
		if (days > maxDays) {
			if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
				return false;
			bReturn = false;

			string errorMsg = "Illegal Pairing: The duty/pairing duration ({0:days}) exceeds the maximum allowable duty/pairing days of {1:maxDays}.";
			errorMsg = StringUtils::Format(errorMsg, days, maxDays);

			//setLegalityMessage(pPairing, singleRule, errorMsg);
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = pPairing->getDbId();
			rv->startDTUtc = pPairing->getStartTimeUtc();
			rv->endDTUtc = pPairing->getEndTimeUtc();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("ruleId", "2003.4"));
			rv->operation_result.insert(pair<string, string>("maxDays", Utility::GetInstancePtr()->iToa(maxDays)));
			rv->operation_result.insert(pair<string, string>("days", Utility::GetInstancePtr()->iToa(days)));
			rv->violation_msg = errorMsg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER) {
				return false;
			}
		}
		//if (dutyNum > iMaxDuties){
		//	bReturn = false;
		//	setLegalityMessage(pPairing, singleRule, "Illegal Pairing: duties in the pairing excceeds the limitation.");
		//}
		if ((allowReturnBaseinDuty == "N")) {
            for (int i = 0; i < dutyNum; i++) {
                const auto &segments = duties[i]->getSegmentsRead();
                for (int j = 0; j < (int)segments.size() - 1; ++j) { // will not check last segment
                    if (segments.at(j)->getArrStationRead() == effectiveBase) {
                        if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
                            return false;
                        bReturn = false;
                        //	setLegalityMessage(pPairing, singleRule, "Not allowed return to base within the duty.");
                        RULE_VIOLATION *rv = new RULE_VIOLATION();
                        rv->pairingId = pPairing->getDbId();
                        rv->startDTUtc = pPairing->getStartTimeUtc();
                        rv->endDTUtc = pPairing->getEndTimeUtc();
                        rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
                        rv->idRule = singleRule->idRule;
						rv->ruleParamId = singleRule->idRuleParam;
                        rv->violation_msg = "Return to base is not allowed in a duty (allowReturnBaseinDuty=N; base=" + effectiveBase
							+ ", dutyIndex=" + Utility::GetInstancePtr()->iToa(i)
							+ ", segmentIndex=" + Utility::GetInstancePtr()->iToa(j) + ").";
                        //OP#1448提供message参数给gantt
                        rv->operation_result.insert(pair<string, string>("ruleId", "2003.5"));
						rv->operation_result.insert(pair<string, string>("base", effectiveBase));
						rv->operation_result.insert(pair<string, string>("dutyIndex", Utility::GetInstancePtr()->iToa(i)));
						rv->operation_result.insert(pair<string, string>("segmentIndex", Utility::GetInstancePtr()->iToa(j)));
                        this->addRuleViolations(rv, singleRule);
                    }
                }
            }

            for (int i = 0; i < dutyNum - 1; i++) {
                if (duties.at(i)->getArrStationRead() == effectiveBase) {
                    if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
                        return false;
                    bReturn = false;
                    //	setLegalityMessage(pPairing, singleRule, "Not allowed return to base within the duty.");
                    RULE_VIOLATION *rv = new RULE_VIOLATION();
                    rv->pairingId = pPairing->getDbId();
                    rv->startDTUtc = pPairing->getStartTimeUtc();
                    rv->endDTUtc = pPairing->getEndTimeUtc();
                    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
                    rv->idRule = singleRule->idRule;
					rv->ruleParamId = singleRule->idRuleParam;
                    rv->violation_msg = "Return to base is not allowed between duties (allowReturnBaseinDuty=N; base=" + effectiveBase
						+ ", dutyIndex=" + Utility::GetInstancePtr()->iToa(i) + " ends at base and there are remaining duties).";
                    //OP#1448提供message参数给gantt
                    rv->operation_result.insert(pair<string, string>("ruleId", "2003.5"));
					rv->operation_result.insert(pair<string, string>("base", effectiveBase));
					rv->operation_result.insert(pair<string, string>("dutyIndex", Utility::GetInstancePtr()->iToa(i)));
					rv->operation_result.insert(pair<string, string>("scenario", "BETWEEN_DUTIES"));
                    this->addRuleViolations(rv, singleRule);
                }
            }
        }
		if (stations.size() > 0 && stations[0] != "*") {
			for (int i = 0; i < dutyNum - 1; i++) {
				string arrStation = duties[i]->getArrStation();
				if (find(stations.begin(), stations.end(), arrStation) == stations.end()) {
					if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
						return false;
					bReturn = false;

					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->pairingId = pPairing->getDbId();
					rv->dutySequenceNumber = duties[i]->getDutySeq();
					rv->startDTUtc = pPairing->getStartTimeUtc();
					rv->endDTUtc = pPairing->getEndTimeUtc();
					rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
					rv->idRule = singleRule->idRule;
					rv->ruleParamId = singleRule->idRuleParam;
					rv->violation_msg = "Not allowed layover at " + arrStation + " station.";
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("ruleId", "2003.6"));
					rv->operation_result.insert(pair<string, string>("arrStation", arrStation));
					rv->operation_result.insert(pair<string, string>("dutyIndex", Utility::GetInstancePtr()->iToa(i)));
					rv->operation_result.insert(pair<string, string>("scenario", "Layover"));
					this->addRuleViolations(rv, singleRule);
				}
			}
		}
	}
	return bReturn;
}

bool LegalityChecker::checkPairingLimitation(Pairing* pPairing)
{
	bool isLegal = true;
	auto& rules = _dbData->getRuleFunctions(RULES::PAIRING_LIMITATION);
	for (auto& singleRule : rules)
	{
		isLegal = isLegal && this->checkPairingLimitation(pPairing, &singleRule);
	}
	return isLegal;
}



bool LegalityChecker::checkPairingLimitation(RULE_LEGALITY * pPairing, const DBRule* singleRule){
	if (pPairing->PairingIndex == -1)
		return true; //no need check pairing rule

	Pairing * pg = this->_dbData->pairingList[pPairing->PairingIndex];
	return checkPairingLimitation(pg, singleRule);
}


bool LegalityChecker::checkPairingLimitation(Pairing* pPairing, const DBRule* singleRule)
{
	// 20230608 统一rule server和优化检查逻辑
	return checkPairingLimitationImplemenation(pPairing->getDutyVec(), singleRule, pPairing);

	// 以下代码不执行，仅用于历史参照
	//long pgNum = pPairing->getDbId();
	//if (pgNum == 26134609 || pgNum == 26134609 || pgNum == 26134687)
	//	printf("");
	bool bReturn = true;
	rule2003* cache = (rule2003*) singleRule->parsedParam.get();

	string base = cache->base;
	int iPgLen = cache->maxPgLength;
	int iMaxDuties = cache->maxDutiesinPG;
	string allowReturnBaseinDuty = cache->allowReturnBaseinDuty;
	string strmaxBlh = cache->maxBlh;
	string strMaxDays = cache->strMaxDays;
	vector<string>& stations = cache->allowableLayoverStation;

	int maxDays = 9999;
	if (strMaxDays != ""){
		maxDays = stoi(strMaxDays);
	}
	int maxBlh = hhmmToMinutes(strmaxBlh.c_str());

	string pairingBase = pPairing->getBase();
	string type = pPairing->getPrimeActivity();
	int dutyNum = (int)pPairing->getDutyVec().size();
	if ((base == pairingBase) && (type == "FLY" || type == "MVO") && dutyNum > 0){

		int blh = pPairing->getBLKInSec() / 60;

		double length = (pPairing->getDutyVec()[dutyNum - 1]->getEndTimeUtcAct() - pPairing->getDutyVec()[0]->getStartTimeUtcAct()) / (60.0 * 60.0);

		//int iPgLen = stoi(maxPgLength);
		//int iMaxDuties = stoi(maxDutiesinPG);
		//auto offsetMinutes = _dbData->getAirportOffsetMinutes(base);
		//落地日期-开始日期+1<=参数设置。取主base时间模式。
		int days = 0;
		if (strMaxDays != ""){
			days = static_cast<int>(pPairing->getPairingRestStartLoc() / SecondsInDay - pPairing->getStartTimeLocAct() / SecondsInDay + 1);
		}
		if (blh > maxBlh)
		{
			if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
				return false;
			bReturn = false;
			stringstream ss;
			ss << "Illegal Pairing: The pairing block hours exceed the limitation (Maximum Block Hours =" << strmaxBlh << ").";
			string errorMsg = ss.str();
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			//rv->rosterId = (*it_roster)->rosterId;
			rv->pairingId = pPairing->getDbId();
			//rv->dutySequenceNumber = duty->getDutySegNum();
			//rv->segmentId = current->getDBId();
			rv->startDTUtc = pPairing->getStartTimeUtc();
			rv->endDTUtc = pPairing->getEndTimeUtc();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("ruleId", "2003.1"));
			rv->operation_result.insert(pair<string, string>("strmaxBlh", strmaxBlh));
			rv->violation_msg = errorMsg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}

		}

		if ((length > iPgLen) || (dutyNum > iMaxDuties))
		{
			if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
				return false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			bReturn = false;
			stringstream errorMsg;
			errorMsg << "Illegal Pairing: ";
			if (length > iPgLen){
				rv->operation_result.insert(pair<string, string>("ruleId", "2003.2"));
				errorMsg << "The pairing length exceeds the limitation";
			}
			else{
				rv->operation_result.insert(pair<string, string>("ruleId", "2003.3"));
				errorMsg << "The number of duties in the pairing exceeds the limitation ";
			}

			errorMsg << "(Maximum Number of Duties =" << iMaxDuties << ",Maximum Pairing Length =" << iPgLen << ").";
			//setLegalityMessage(pPairing, singleRule, errorMsg);

			//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			//rv->rosterId = (*it_roster)->rosterId;
			rv->pairingId = pPairing->getDbId();
			//rv->dutySequenceNumber = duty->getDutySegNum();
			//rv->segmentId = current->getDBId();
			rv->startDTUtc = pPairing->getStartTimeUtc();
			rv->endDTUtc = pPairing->getEndTimeUtc();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			//OP#1448提供message参数给gantt
			string strMaxDutiesinPG = intToStr(cache->maxDutiesinPG);
			string strMaxPgLength = intToStr(cache->maxPgLength);
			rv->operation_result.insert(pair<string, string>("maxDutiesinPG", strMaxDutiesinPG));
			rv->operation_result.insert(pair<string, string>("maxPgLength", strMaxPgLength));
			rv->violation_msg = errorMsg.str();
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
		if (days > maxDays){
			if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
				return false;
			bReturn = false;
			string errorMsg = "Illegal Pairing: The pairing length exceeds the limitation";
			errorMsg += " Max Pairing Days " + Utility::GetInstancePtr()->iToa(maxDays)
				+ " Days less than " + Utility::GetInstancePtr()->iToa(days);
			//setLegalityMessage(pPairing, singleRule, errorMsg);
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = pPairing->getDbId();
			rv->startDTUtc = pPairing->getStartTimeUtc();
			rv->endDTUtc = pPairing->getEndTimeUtc();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("ruleId", "2003.4"));
			rv->operation_result.insert(pair<string, string>("maxDays", Utility::GetInstancePtr()->iToa(maxDays)));
			rv->operation_result.insert(pair<string, string>("days", Utility::GetInstancePtr()->iToa(days)));
			rv->violation_msg = errorMsg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
		//if (dutyNum > iMaxDuties){
		//	bReturn = false;
		//	setLegalityMessage(pPairing, singleRule, "Illegal Pairing: duties in the pairing excceeds the limitation.");
		//}
		if ((dutyNum > 1) && (allowReturnBaseinDuty == "N"))
		{
			for (int i = 0; i < dutyNum - 1; i++){
				string arrStation = pPairing->getDutyVec()[i]->getArrStation();
				if (arrStation == base){
					if (pPairing == nullptr || this->_application == PAIRING_OPTIMIZER)
						return false;
					bReturn = false;
					//	setLegalityMessage(pPairing, singleRule, "Not allowed return to base within the duty.");
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->pairingId = pPairing->getDbId();
					rv->startDTUtc = pPairing->getStartTimeUtc();
					rv->endDTUtc = pPairing->getEndTimeUtc();
					rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
					rv->idRule = singleRule->idRule;
					rv->ruleParamId = singleRule->idRuleParam;
					rv->violation_msg = "Not allowed return to base within the duty.";
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("ruleId", "2003.5"));
					this->addRuleViolations(rv, singleRule);
				}
			}
		}

		if (stations.size() > 0 && stations[0] != "*") {
			for (int i = 0; i < dutyNum - 1; i++){
				string arrStation = pPairing->getDutyVec()[i]->getArrStation();
				if (find(stations.begin(), stations.end(), arrStation) == stations.end()){
					bReturn = false;
				}
			}
		}
	}
	return bReturn;
}



bool LegalityChecker::checkPairingLimitation(const vector<Duty *>& duties, const DBRule* singleRule)
{
	// 20230608 统一rule server和优化检查逻辑
	return checkPairingLimitationImplemenation(duties, singleRule, nullptr);

	// 以下代码不执行，仅用于历史参照
	//long pgNum = pPairing->getDbId();
	//if (pgNum == 26134609 || pgNum == 26134609 || pgNum == 26134687)
	//	printf("");
	bool bReturn = true;
	rule2003* cache = (rule2003*)singleRule->parsedParam.get();

	string base = cache->base;
	int iPgLen = cache->maxPgLength;
	int iMaxDuties = cache->maxDutiesinPG;
	string allowReturnBaseinDuty = cache->allowReturnBaseinDuty;
	string strmaxBlh = cache->maxBlh;
	string strMaxDays = cache->strMaxDays;
	vector<string>& stations = cache->allowableLayoverStation;

	int maxDays = 9999;
	if (strMaxDays != "") {
		maxDays = stoi(strMaxDays);
	}
	int maxBlh = hhmmToMinutes(strmaxBlh.c_str());
	string pairingBase = duties[0]->getDepStation();
	int dutyNum = (int)duties.size();
	if ((base == pairingBase) && dutyNum > 0) {

		int blh = 0;
		for (auto d : duties) {
			blh += d->getBLKInMins();
		}
		//pPairing->getBLKInSec() / 60;

		double length = (duties[dutyNum - 1]->getEndTimeUtcAct() - duties[0]->getStartTimeUtcAct()) / (60.0 * 60.0);

		//int iPgLen = stoi(maxPgLength);
		//int iMaxDuties = stoi(maxDutiesinPG);
		//auto offsetMinutes = _dbData->getAirportOffsetMinutes(base);
		//落地日期-开始日期+1<=参数设置。取主base时间模式。
		int days = 0;
		if (strMaxDays != "") {
			days = static_cast<int>(duties[dutyNum - 1]->getEndTimeLocAct() / SecondsInDay - duties[0]->getStartTimeLocAct() / SecondsInDay + 1);
		}
		if (blh > maxBlh)
		{
			return false;
		}

		if ((length > iPgLen) || (dutyNum > iMaxDuties))
		{
			return false;
		}
		if (days > maxDays) {
			return false;
		}
		//if (dutyNum > iMaxDuties){
		//	bReturn = false;
		//	setLegalityMessage(pPairing, singleRule, "Illegal Pairing: duties in the pairing excceeds the limitation.");
		//}
		if ((dutyNum > 1) && (allowReturnBaseinDuty == "N"))
		{
			for (int i = 0; i < dutyNum - 1; i++) {
				string arrStation = duties[i]->getArrStation();
				if (arrStation == base) {
					return false;
				}
			}
		}

		if (stations.size() > 0 && stations[0] != "*") {
			for (int i = 0; i < dutyNum - 1; i++) {
				string arrStation = duties[i]->getArrStation();
				if (find(stations.begin(), stations.end(), arrStation) == stations.end()) {
					bReturn = false;
				}
			}
		}


	}
	return bReturn;
}
