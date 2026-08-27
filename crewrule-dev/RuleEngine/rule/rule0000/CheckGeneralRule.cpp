/**
 * @file CheckGeneralRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckGeneralRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/AssignmentUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

inline static void printDebugRO(const bool _debug_RO, const int application, const Duty* duty, const RULE_LIMITATION_TYPE type) {
	if (_debug_RO && application == ROSTER_OPTIMIZER) {
		limitaions* limit = duty->getLimiation(type);
		if (limit != nullptr) {
			cout <<"general Rule:" << limit->last_set_rule << endl;
		}
	}
}

inline static const int GetPhase(const int ruleId, const long long ruleParamId, const std::shared_ptr<CrewDataContext>& dbData) {
	int function = ruleId / 1000;
	auto& ruleList = dbData->getRuleFunctions(function);
	for(auto& rule : ruleList) {
		if(rule.idRuleParam == ruleParamId) {
			return rule.phase;
		}
	}
	return 0;
}

inline static const DBRule* GetRule(const int ruleId, const long long ruleParamId, const std::shared_ptr<CrewDataContext>& dbData) {
	int function = ruleId / 1000;
	auto& ruleList = dbData->getRuleFunctions(function);
	for (auto& rule : ruleList) {
		if (rule.idRuleParam == ruleParamId) {
			return &rule;
		}
	}
	return nullptr;
}

bool CheckGeneralRule::CheckRule(const Pairing* pairing) const {
	return CheckRule(pairing->getDutyVec());
}

bool CheckGeneralRule::CheckRule(const Duty* duty) const {
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool CheckGeneralRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	auto workPeriods = WorkPeriod::GetWorkPeriods(rosters, this->_dbData);
	return CheckRule(workPeriods);
}

bool CheckGeneralRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties.at(i);
		Duty* nextDuty = (i + 1) >= duties.size() ? nullptr : duties.at(i + 1);
		bool valid = CheckRule(currDuty, nextDuty);
		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool CheckGeneralRule::CheckRule(const Duty* currDuty, const Duty* nextDuty) const {
	bool valid = true;

	int warnCode = CheckAllRule(currDuty, nextDuty);

	if ((warnCode & (int)CheckGeneralRule::WarnCode::FDP_EXTENSION_WARN) == (int)CheckGeneralRule::WarnCode::FDP_EXTENSION_WARN) {
		valid = false;
		int fdpMaxAutoExtension = 0;
		for (auto& pair : const_cast<Duty*>(currDuty)->getDutyDelta().getFDPMinutes()) {
			fdpMaxAutoExtension += pair.second;
		}
		fdpMaxAutoExtension += currDuty->getExtendFdpMin();
		_ruleViolation.SetParam("fdpMaxAutoExtension", TimeUtils::MinutesTohhmm(fdpMaxAutoExtension));

		if (currDuty->supportDiscretionType(DiscretionType::FDP)) {
			_ruleViolation.SetParam("fdpMaxManualExtension", TimeUtils::MinutesTohhmm(currDuty->getTotalFdpDiscretion()));
		}
		else {
			_ruleViolation.SetParam("fdpMaxManualExtension", "00:00");
		}
		ThrowFdpDiscretioRuleViolation(currDuty);
	}
	if ((warnCode & (int)CheckGeneralRule::WarnCode::FT_EXTENSION_WARN) == (int)CheckGeneralRule::WarnCode::FT_EXTENSION_WARN) {
		valid = false;
		if (currDuty->supportDiscretionType(DiscretionType::FT)) {
			_ruleViolation.SetParam("ftMaxManualExtension", TimeUtils::MinutesTohhmm(currDuty->getTotalFtDiscretion()));
		}
		else {
			_ruleViolation.SetParam("ftMaxManualExtension", "00:00");
		}
		ThrowFtDiscretioRuleViolation(currDuty);
	}
	if ((warnCode & (int)CheckGeneralRule::WarnCode::MAX_DP_WARN) == (int)CheckGeneralRule::WarnCode::MAX_DP_WARN) {
		valid = false;
		ThrowDpDiscretioRuleViolation(currDuty);
	}
	if ((warnCode & (int)CheckGeneralRule::WarnCode::MIN_REST_WARN) == (int)CheckGeneralRule::WarnCode::MIN_REST_WARN) {
		valid = false;
		if (currDuty->supportDiscretionType(DiscretionType::REST)) {
			_ruleViolation.SetParam("restMaxManualReduction", TimeUtils::MinutesTohhmm(currDuty->getTotalRestDiscretion()));
		}
		else {
			_ruleViolation.SetParam("restMaxManualReduction", "00:00");
		}
		ThrowMinRestRuleViolation(currDuty);
	}

	return valid;
}

//检查是否满足参数
int  CheckGeneralRule::CheckAllRule(const Duty* currDuty, const Duty* nextDuty) const {
	int warnCode = (int)WarnCode::NO_WARN;

	_ruleViolation.SetParam("callinSBY_FDPMins", "0");
	if (!IgnoreCheck(currDuty, RULE_LIMITATION_TYPE::MAX_FDP) && !CheckMaxFDP(currDuty)) {
		warnCode = (int)WarnCode::FDP_EXTENSION_WARN;
		printDebugRO(_debug_RO, this->_application, currDuty, RULE_LIMITATION_TYPE::MAX_FDP);
	}

	if (!IgnoreCheck(currDuty, RULE_LIMITATION_TYPE::MAX_BLOCK) && !CheckMaxFT(currDuty)) {
		warnCode = warnCode | (int)WarnCode::FT_EXTENSION_WARN;
		printDebugRO(_debug_RO, this->_application, currDuty, RULE_LIMITATION_TYPE::MAX_BLOCK);
	}

	if (!IgnoreCheck(currDuty, RULE_LIMITATION_TYPE::MAX_DP) && !CheckMaxDP(currDuty)) {
		warnCode = warnCode | (int)WarnCode::MAX_DP_WARN;
		printDebugRO(_debug_RO, this->_application, currDuty, RULE_LIMITATION_TYPE::MAX_DP);
	}

	if (!IgnoreCheck(currDuty, RULE_LIMITATION_TYPE::MIN_REST) && !CheckMinRest(currDuty, nextDuty)) {
		warnCode = warnCode | (int)WarnCode::MIN_REST_WARN;
		printDebugRO(_debug_RO, this->_application, currDuty, RULE_LIMITATION_TYPE::MIN_REST);
	}

	return warnCode;
}

//检查最大飞行执勤期FDP是否满足
bool CheckGeneralRule::CheckMaxFDP(const Duty* currDuty, const long callinSBY_FDPMins) const {
	//5J和TG使用EASA 7302法规，因此需要扣减Standby的MAX FDP值，因此实际FDP不需要加入callout待命时间
	long currFDPMinutes = currDuty->getFDPInSecs() / 60;
	if (this->_dbData->scenario.airline != "5J" && this->_dbData->scenario.airline != "TG") {
		currFDPMinutes += callinSBY_FDPMins;
	}
	
	int maxFDP = currDuty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
	if (maxFDP < 0) {
		//没有MaxFDP限制
		return true;
	}
	maxFDP += currDuty->getExtendFdpMin();
	if (currDuty->supportDiscretionType(DiscretionType::FDP)) {
		maxFDP += currDuty->getTotalFdpDiscretion();	
	}
	if (currFDPMinutes > maxFDP) {
		return false;
	}
	return true;
}

//检查最大飞时FT是否满足
bool CheckGeneralRule::CheckMaxFT(const Duty* currDuty) const {
	int currFTMinutes = const_cast<Duty*>(currDuty)->getActualBlockTime();
	int maxFT = currDuty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_BLOCK);
	if (maxFT < 0) {
		//没有MaxFT限制
		return true;
	}
	if (currDuty->supportDiscretionType(DiscretionType::FT)) {
		maxFT += currDuty->getTotalFtDiscretion();
	}
	if (currFTMinutes > maxFT) {
		return false;
	}
	return true;
}

//检查最大执勤期DP是否满足
bool CheckGeneralRule::CheckMaxDP(const Duty* currDuty, ROSTER* roster) const {
	int currDPMinutes = const_cast<Duty*>(currDuty)->getDPInSecs() / 60;
	if (roster) {
		currDPMinutes = roster->dutyValues.getActDp(currDuty->getDutySeq() - 1);
	}
	int maxDP = currDuty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_DP);
	if (maxDP < 0) {
		//没有MaxDP限制
		return true;
	}
	if (currDuty->supportDiscretionType(DiscretionType::DP)) {
		maxDP += currDuty->getTotalDpDiscretion();
	}
	if (currDPMinutes > maxDP) {
		return false;
	}
	return true;
}

//检查Rest Reduction是否满足
bool CheckGeneralRule::CheckMinRest(const Duty* currDuty, const Duty* nextDuty) const {

	if (!nextDuty) return true;
	int actualRest = DutyUtils::GetActualRestMinutes(currDuty, nextDuty, this->_dbData);

	time_t actRestStartTimeUtc = currDuty->getLastDropoff()->getEndTimeUtcAct();
	_ruleViolation.SetParam("actualRest", TimeUtils::MinutesTohhmm(actualRest));
	_ruleViolation.SetParam("actRestStartTimeUtc", StringUtils::lltos((long long)actRestStartTimeUtc));
	_ruleViolation.SetParam("actRestEndTimeUtc", StringUtils::lltos((long long)(actRestStartTimeUtc + (time_t)actualRest*60)));
	int minRest = currDuty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST);
	if (minRest < 0) {
		//没有MinRest限制
		return true;
	}
	if (currDuty->supportDiscretionType(DiscretionType::REST)) {
		minRest -= currDuty->getTotalRestDiscretion();
	}
	if (actualRest < minRest) {
		return false;
	}
	return true;
}

bool CheckGeneralRule::CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods) const {
	if (workPeriods.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (std::size_t i = 0; i < workPeriods.size(); i++) {
		WorkPeriod* currWorkPeriod = workPeriods[i].get();
		WorkPeriod* nextWorkPeriod = (i + 1) >= workPeriods.size() ? nullptr : workPeriods[i + 1].get();
        if (this->_application == ROSTER_OPTIMIZER && currWorkPeriod->GetSource() == "PA" && nextWorkPeriod && nextWorkPeriod->GetSource() == "PA")
            continue;
		if (currWorkPeriod->GetWorkType() != WorkType::FltDuty) {
			//当前任务为地面任务，仅检查MinRest
			bool valid = CheckRuleForGround(currWorkPeriod, nextWorkPeriod);
			if (!valid) {
				ThrowMinRestRuleViolation(currWorkPeriod->GetRoster());
				passAllRule = false;
			}

			continue;
		}
		bool valid = CheckRule(currWorkPeriod, nextWorkPeriod);
		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool CheckGeneralRule::CheckRule(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod) const {
	bool valid = true;
	int warnCode = CheckAllRule(currWorkPeriod, nextWorkPeriod);

	Duty* currDuty = (Duty*)currWorkPeriod->GetWork();
	ROSTER* roster = currWorkPeriod->GetRoster();
	if ((warnCode & (int)CheckGeneralRule::WarnCode::FDP_EXTENSION_WARN) == (int)CheckGeneralRule::WarnCode::FDP_EXTENSION_WARN) {
		valid = false;
		int fdpMaxAutoExtension = 0;
		for (auto& pair : const_cast<Duty*>(currDuty)->getDutyDelta().getFDPMinutes()) {
			fdpMaxAutoExtension += pair.second;
		}
		fdpMaxAutoExtension += currDuty->getExtendFdpMin();
		_ruleViolation.SetParam("fdpMaxAutoExtension", TimeUtils::MinutesTohhmm(fdpMaxAutoExtension));

		if (currDuty->supportDiscretionType(DiscretionType::FDP)) {
			_ruleViolation.SetParam("fdpMaxManualExtension", TimeUtils::MinutesTohhmm(currDuty->getTotalFdpDiscretion()));
		}
		else {
			_ruleViolation.SetParam("fdpMaxManualExtension", "00:00");
		}
		ThrowFdpDiscretioRuleViolation(currDuty);
	}
	if ((warnCode & (int)CheckGeneralRule::WarnCode::FT_EXTENSION_WARN) == (int)CheckGeneralRule::WarnCode::FT_EXTENSION_WARN) {
		valid = false;
		if (currDuty->supportDiscretionType(DiscretionType::FT)) {
			_ruleViolation.SetParam("ftMaxManualExtension", TimeUtils::MinutesTohhmm(currDuty->getTotalFtDiscretion()));
		}
		else {
			_ruleViolation.SetParam("ftMaxManualExtension", "00:00");
		}
		ThrowFtDiscretioRuleViolation(currDuty);
	}
	if ((warnCode & (int)CheckGeneralRule::WarnCode::MAX_DP_WARN) == (int)CheckGeneralRule::WarnCode::MAX_DP_WARN) {
		valid = false;
		if (currDuty->supportDiscretionType(DiscretionType::DP)) {
			_ruleViolation.SetParam("dpMaxManualExtension", TimeUtils::MinutesTohhmm(currDuty->getTotalDpDiscretion()));
		}
		else {
			_ruleViolation.SetParam("dpMaxManualExtension", "00:00");
		}
		ThrowDpDiscretioRuleViolation(currDuty, roster);
	}
	if ((warnCode & (int)CheckGeneralRule::WarnCode::MIN_REST_WARN) == (int)CheckGeneralRule::WarnCode::MIN_REST_WARN) {
		valid = false;
		if (currDuty->supportDiscretionType(DiscretionType::REST)) {
			_ruleViolation.SetParam("restMaxManualReduction", TimeUtils::MinutesTohhmm(currDuty->getTotalRestDiscretion()));
		}
		else {
			_ruleViolation.SetParam("restMaxManualReduction", "00:00");
		}
		ThrowMinRestRuleViolation(currDuty);
	}

	return valid;
}

int CheckGeneralRule::CheckAllRule(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod) const {
	int warnCode = (int)WarnCode::NO_WARN;
	Duty* currDuty = (Duty*)currWorkPeriod->GetWork();

	long callinSBY_FDPMins = 0;
	ROSTER* roster = currWorkPeriod->GetRoster();
	if (roster != nullptr && roster->callinSBY_FDPMins > 0 && currDuty->getDutySeq() == 1) {
		//仅Pairing的第一个Duty才会出现抓飞(called out, 即 call in)
		callinSBY_FDPMins = roster->callinSBY_FDPMins;
	}
	_ruleViolation.SetParam("callinSBY_FDPMins", StringUtils::ltos(callinSBY_FDPMins));
	if (!IgnoreCheck(roster, currDuty, RULE_LIMITATION_TYPE::MAX_FDP) && !CheckMaxFDP(currDuty, callinSBY_FDPMins)) {
		warnCode = (int)WarnCode::FDP_EXTENSION_WARN;
		printDebugRO(_debug_RO, this->_application, currDuty, RULE_LIMITATION_TYPE::MAX_FDP);
	}

	if (!IgnoreCheck(roster, currDuty, RULE_LIMITATION_TYPE::MAX_BLOCK) && !CheckMaxFT(currDuty)) {
		warnCode = warnCode | (int)WarnCode::FT_EXTENSION_WARN;
		printDebugRO(_debug_RO, this->_application, currDuty, RULE_LIMITATION_TYPE::MAX_BLOCK);
	}

	if (!IgnoreCheck(roster, currDuty, RULE_LIMITATION_TYPE::MAX_DP) && !CheckMaxDP(currDuty, roster)) {
		warnCode = warnCode | (int)WarnCode::MAX_DP_WARN;
		printDebugRO(_debug_RO, this->_application, currDuty, RULE_LIMITATION_TYPE::MAX_DP);
	}

	if (!IgnoreCheck(roster, currDuty, RULE_LIMITATION_TYPE::MIN_REST) && !CheckMinRest(currDuty, nextWorkPeriod)) {
		warnCode = warnCode | (int)WarnCode::MIN_REST_WARN;
		printDebugRO(_debug_RO, this->_application, currDuty, RULE_LIMITATION_TYPE::MIN_REST);
	}

	return warnCode;

}

bool CheckGeneralRule::CheckMinRest(const Duty* currDuty, const WorkPeriod* nextWorkPeriod) const {
	if (nextWorkPeriod != nullptr && nextWorkPeriod->GetRoster() != nullptr 
		&& nextWorkPeriod->GetRoster()->callinSBY_FDPMins > 0) {
		//当前Standby存在抓飞，则不用检查min rest
		return true;
	}

	//判断后续任务是否是休息任务
	if (nextWorkPeriod != nullptr && RuleParams::GetInstancePtr()->isRestAssignment(nextWorkPeriod->GetRoster()->qualifier, nextWorkPeriod->GetRoster()->duty)) {
		return true;
	}

	string nextWorkPeriodAssignment = "";
	bool isSamePairing = false;
	int minRest = currDuty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST);
	time_t actRestStartTimeUtc = currDuty->getLastDropoff()->getEndTimeUtcAct();
	int actualRest = minRest;
	if (nextWorkPeriod == nullptr) {
		actualRest = minRest;
	}
	else if (nextWorkPeriod->GetWorkType() == WorkType::FltDuty) {
		Duty* nextDuty = (Duty*)nextWorkPeriod->GetWork();
		actualRest = DutyUtils::GetActualRestMinutes(currDuty, nextDuty, this->_dbData);
		nextWorkPeriodAssignment = nextDuty->getAssignment();
		isSamePairing = currDuty->getPairingId() == nextDuty->getPairingId();
	}
	else if (nextWorkPeriod->GetWorkType() == WorkType::GroundRoster) {
		ROSTER* nextRoster = (ROSTER*)nextWorkPeriod->GetWork();
		actualRest = DutyUtils::GetActualRestMinutes(currDuty, nextRoster, this->_dbData);
		nextWorkPeriodAssignment = nextRoster->qualifier;
	}

	//判断当前任务和后续任务MRT是否可以重叠
	if (!isSamePairing && !nextWorkPeriodAssignment.empty() && AssignmentUtils::IsAssignmentMrtOveride(currDuty->getAssignment(), nextWorkPeriodAssignment, this->GetDataContext())) {
		return true;
	}

	_ruleViolation.SetParam("actualRest", TimeUtils::MinutesTohhmm(actualRest));
	_ruleViolation.SetParam("actRestStartTimeUtc", StringUtils::lltos((long long)actRestStartTimeUtc));
	_ruleViolation.SetParam("actRestEndTimeUtc", StringUtils::lltos((long long)(actRestStartTimeUtc + (time_t)actualRest*60)));

	if (minRest < 0) {
		//没有MinRest限制
		return true;
	}
	if (currDuty->supportDiscretionType(DiscretionType::REST)) {
		minRest -= currDuty->getTotalRestDiscretion();
	}
	if (actualRest < minRest) {
		return false;
	}
	return true;
}

bool CheckGeneralRule::CheckRuleForGround(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod) const {
	bool isCheckGround = false;
	auto& dbData = this->GetDataContext();
	ROSTER* currRoster = currWorkPeriod->GetRoster();
	if (currRoster == nullptr) {
		return true;
	}
	limitaions* limit = (currRoster == nullptr) ? nullptr : currRoster->getLimiation(RULE_LIMITATION_TYPE::MIN_REST);
	if (dbData->systemParamMap.find("CHECK_GND_REST") != dbData->systemParamMap.end())
		isCheckGround = strToUpper(dbData->systemParamMap["CHECK_GND_REST"]) == "Y";
	if (limit == nullptr  && !isCheckGround) {
		return true;
	}

	//地面任务仅检查MinRest
	if (nextWorkPeriod == nullptr || nextWorkPeriod->GetRoster() == nullptr) {
		return true;
	}
	if (nextWorkPeriod != nullptr && nextWorkPeriod->GetRoster() != nullptr
		&& nextWorkPeriod->GetRoster()->callinSBY_FDPMins > 0) {
		//当前Standby存在抓飞，则不用检查min rest
		return true;
	}
	
	ROSTER* nextRoster = nextWorkPeriod->GetRoster();
	if (nextWorkPeriod != nullptr && AssignmentUtils::IsAssignmentMrtOveride(currRoster->qualifier, nextWorkPeriod->GetRoster()->qualifier, this->GetDataContext())) {
		return true;
	}

	//判断后续任务是否是休息任务
	if (nextWorkPeriod != nullptr && RuleParams::GetInstancePtr()->isRestAssignment(nextWorkPeriod->GetRoster()->qualifier, nextWorkPeriod->GetRoster()->duty)) {
		return true;
	}

	auto iterAssignment = dbData->assignmentNameMap.find(currRoster->qualifier);
	if (iterAssignment == dbData->assignmentNameMap.end()) {
		return true;
	}

	//int minRest = iterAssignment->second->REST_TIME <= 0 ? 0 : iterAssignment->second->REST_TIME;
	int minRest = currRoster->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST);
	if (minRest <= 0) {
		minRest = iterAssignment->second->REST_TIME <= 0 ? 0 : iterAssignment->second->REST_TIME;
	}
	
	time_t actRestStartTimeUtc = currRoster->getRestStartUtcAct();
	int actualRest = static_cast<int>(nextRoster->getStartTimeUtcAct() - actRestStartTimeUtc) / 60;
	_ruleViolation.SetParam("actualRest", TimeUtils::MinutesTohhmm(actualRest));
	_ruleViolation.SetParam("minRest", TimeUtils::MinutesTohhmm(minRest));
	_ruleViolation.SetParam("actRestStartTimeUtc", StringUtils::lltos((long long)actRestStartTimeUtc));
	_ruleViolation.SetParam("actRestEndTimeUtc", StringUtils::lltos((long long)(actRestStartTimeUtc + (time_t)actualRest * 60)));

	if (minRest <= 0) {
		//没有MinRest限制
		return true;
	}
	if (actualRest < minRest) {
		return false;
	}
	return true;
}

bool CheckGeneralRule::IgnoreCheck(const ROSTER* roster, const Duty* duty, const RULE_LIMITATION_TYPE type) const {
	if (roster == nullptr) {
		return false;
	}
	limitaions* limit = duty->getLimiation(type);
	if (limit == nullptr) {
		return false;
	}
	if (!limit->isFinalChecked && limit->classType == RuleClassType::PO) {
		return true;
	}
	long long function = limit->last_set_rule / 1000;
	auto& ruleList = this->_dbData->getRuleFunctions(function);
	for (auto& dbRule : ruleList) {
		if (dbRule.idRule == limit->last_set_rule) {
			if (RosterUtils::ExistExceptionCode(roster, duty, dbRule.exceptionCodes, this->_dbData)) {
				return true;
			}
			break;
		}
	}
	return false;
}

bool CheckGeneralRule::IgnoreCheck(const Duty* duty, const RULE_LIMITATION_TYPE type) const {
	limitaions* limit = duty->getLimiation(type);
	if (limit == nullptr || limit->isFinalChecked) {
		return false;
	}
	return true;
}

void CheckGeneralRule::ThrowFdpDiscretioRuleViolation(const Duty* duty) const {
	long callinSBY_FDPMins = StringUtils::stol(_ruleViolation.GetParam("callinSBY_FDPMins"), 0);

	//5J和TG使用EASA 7302法规，因此需要扣减Standby的MAX FDP值，因此实际FDP不需要加入callout待命时间
	string currFDP = TimeUtils::MinutesTohhmm(duty->getFDPInSecs() / 60);
	if (this->_dbData->scenario.airline != "5J" && this->_dbData->scenario.airline != "TG") {
		currFDP = TimeUtils::MinutesTohhmm(duty->getFDPInSecs() / 60 + callinSBY_FDPMins);
	}

	limitaions* limit = duty->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);
	string fdpMaxManualExtension = _ruleViolation.GetParam("fdpMaxManualExtension");
	string fdpMaxAutoExtension = _ruleViolation.GetParam("fdpMaxAutoExtension");
	string maxFDP = TimeUtils::MinutesTohhmm(limit->value + TimeUtils::hhmmToMinutes(fdpMaxManualExtension));
	std::string msg = "The actual Flight Duty Period({0:currFDP}) exceeds the combined total of the maximum allowed FDP({1:maxFDP}), the automatic FDP extension limit ({2:fdpMaxAutoExtension}), and the manual FDP extension limit({3:fdpMaxManualExtension}).";
	msg = StringUtils::Format(msg, currFDP, maxFDP, fdpMaxAutoExtension, fdpMaxManualExtension);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = limit->last_set_rule;
	rv->ruleParamId = limit->ruleParamId;
	rv->phase = GetPhase(limit->last_set_rule, limit->ruleParamId, this->_dbData);
	rv->ishard = (limit->overrideAbility == "H");
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	rv->description = limit->description;
	rv->reference = limit->reference;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("currFDP", currFDP));
	rv->operation_result.insert(pair<string, string>("maxFDP", maxFDP));
	rv->operation_result.insert(pair<string, string>("fdpMaxManualExtension", fdpMaxManualExtension));

	if (_ruleViolation.ExistRuleViolation(rv))
		return;
	_ruleViolation.AddRuleViolations(rv);
}

void CheckGeneralRule::ThrowFtDiscretioRuleViolation(const Duty* duty) const {
	string currFT = TimeUtils::MinutesTohhmm(const_cast<Duty*>(duty)->getBLKInMins());
	limitaions* limit = duty->getLimiation(RULE_LIMITATION_TYPE::MAX_BLOCK);
	string maxFT = TimeUtils::MinutesTohhmm(limit->value);
	string ftMaxManualExtension = _ruleViolation.GetParam("ftMaxManualExtension");
	std::string msg = "The actual Flight Time({0:currFT}) exceeds the combined total of the maximum allowed Flight Time({1:maxFT}) and the manual Flight Time extension limit({2:ftMaxManualExtension}).";
	msg = StringUtils::Format(msg, currFT, maxFT, ftMaxManualExtension);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = limit->last_set_rule;
	rv->ruleParamId = limit->ruleParamId;
	rv->phase = GetPhase(limit->last_set_rule, limit->ruleParamId, this->_dbData);
	rv->ishard = (limit->overrideAbility == "H");
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	rv->description = limit->description;
	rv->reference = limit->reference;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("currFT", currFT));
	rv->operation_result.insert(pair<string, string>("maxFT", maxFT));
	rv->operation_result.insert(pair<string, string>("ftMaxManualExtension", ftMaxManualExtension));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckGeneralRule::ThrowDpDiscretioRuleViolation(const Duty* duty, ROSTER* roster) const {
	string currDP = TimeUtils::MinutesTohhmm(const_cast<Duty*>(duty)->getDPInSecs()/60);
	if (roster) {
		currDP = TimeUtils::MinutesTohhmm(roster->dutyValues.getActDp(duty->getDutySeq() - 1));
	}
	limitaions* limit = duty->getLimiation(RULE_LIMITATION_TYPE::MAX_DP);
	string maxDP = TimeUtils::MinutesTohhmm(limit->value);
	string dpMaxManualExtension = _ruleViolation.GetParam("dpMaxManualExtension");
	std::string msg = "The actual Duty Period({0:currDP}) exceeds the maximum permitted Duty Period({1:maxDP}) and the manual Duty Period extension limit({2:dpMaxManualExtension}).";
	msg = StringUtils::Format(msg, currDP, maxDP, dpMaxManualExtension);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = limit->last_set_rule;
	rv->ruleParamId = limit->ruleParamId;
	rv->phase = GetPhase(limit->last_set_rule, limit->ruleParamId, this->_dbData);	
	rv->ishard = (limit->overrideAbility == "H");
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	rv->description = limit->description;
	rv->reference = limit->reference;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("currDP", currDP));
	rv->operation_result.insert(pair<string, string>("maxDP", maxDP));
	if (_ruleViolation.ExistRuleViolation(rv))
		return;
	_ruleViolation.AddRuleViolations(rv);
}

void CheckGeneralRule::ThrowMinRestRuleViolation(const Duty* duty) const {
	string actualRest = _ruleViolation.GetParam("actualRest");
	string actRestStartTimeUtc = _ruleViolation.GetParam("actRestStartTimeUtc");
	string actRestEndTimeUtc = _ruleViolation.GetParam("actRestEndTimeUtc");

	limitaions* limit = duty->getLimiation(RULE_LIMITATION_TYPE::MIN_REST);
	string minRest = TimeUtils::MinutesTohhmm(limit->value);
	string restMaxManualReduction = _ruleViolation.GetParam("restMaxManualReduction");
	std::string msg = "The actual duty rest period ({0:actualRest}) is less than the minimum required duty rest period ({1:minRest}) , including the maximum allowable manual rest reduction ({2:restMaxManualReduction}).";
	msg = StringUtils::Format(msg, actualRest, minRest, restMaxManualReduction);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = limit->last_set_rule;
	rv->ruleParamId = limit->ruleParamId;
	rv->phase = GetPhase(limit->last_set_rule, limit->ruleParamId, this->_dbData);	
	rv->ishard = (limit->overrideAbility == "H");
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	rv->description = limit->description;
	rv->reference = limit->reference;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	rv->startDTUtc = (time_t)StringUtils::stoll(actRestStartTimeUtc, 0);
	rv->endDTUtc = (time_t)StringUtils::stoll(actRestEndTimeUtc, 0);
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("actualRest", actualRest));
	rv->operation_result.insert(pair<string, string>("actRestStartTimeUtc", actRestStartTimeUtc));
	rv->operation_result.insert(pair<string, string>("actRestEndTimeUtc", actRestEndTimeUtc));
	rv->operation_result.insert(pair<string, string>("minRest", minRest));
	rv->operation_result.insert(pair<string, string>("restMaxManualReduction", restMaxManualReduction));
	if (_ruleViolation.ExistRuleViolation(rv))
		return;
	_ruleViolation.AddRuleViolations(rv);
}

void CheckGeneralRule::ThrowMinRestRuleViolation(const ROSTER* roster) const {
	auto& groundRosterRuleList = _dbData->getRuleFunctions(RULES::CHECK_GROUND_ROSTER_MIN_REST);

	string actualRest = _ruleViolation.GetParam("actualRest");
	string actRestStartTimeUtc = _ruleViolation.GetParam("actRestStartTimeUtc");
	string actRestEndTimeUtc = _ruleViolation.GetParam("actRestEndTimeUtc");

	string minRest = _ruleViolation.GetParam("minRest");
	std::string msg = "The actual roster rest period ({0:actualRest}) is less than the minimum required rest period ({1:minRest}).";
	msg = StringUtils::Format(msg, actualRest, minRest);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (groundRosterRuleList.empty()) {
		rv->idRule = 0;
		rv->ruleParamId = 0;
		rv->ishard = false;
		rv->description = "General Rule";
	}
	else {
		auto& firstDbRule = groundRosterRuleList.front();

		rv->idRule = firstDbRule.idRule;
		rv->ruleParamId = firstDbRule.idRuleParam;
		rv->description = firstDbRule.description;
		rv->reference = firstDbRule.reference;
		rv->ishard = (firstDbRule.overridebility == "H");
		rv->overridebility = firstDbRule.overridebility;
		rv->phase = firstDbRule.phase;
	}

	limitaions* limit = roster->getLimiation(RULE_LIMITATION_TYPE::MIN_REST);
	if (limit != nullptr) {
		rv->idRule = limit->last_set_rule;
		rv->ruleParamId = limit->ruleParamId;
		auto dbRule = GetRule(limit->last_set_rule, limit->ruleParamId, this->_dbData);
		rv->description = dbRule->description;
		rv->reference = dbRule->reference;
		rv->ishard = (dbRule->overridebility == "H");
		rv->overridebility = dbRule->overridebility;
		rv->phase = dbRule->phase;
	}

	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;

	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = roster->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	rv->startDTUtc = (time_t)StringUtils::stoll(actRestStartTimeUtc, 0);
	rv->endDTUtc = (time_t)StringUtils::stoll(actRestEndTimeUtc, 0);
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("actualRest", actualRest));
	rv->operation_result.insert(pair<string, string>("actRestStartTimeUtc", actRestStartTimeUtc));
	rv->operation_result.insert(pair<string, string>("actRestEndTimeUtc", actRestEndTimeUtc));
	rv->operation_result.insert(pair<string, string>("minRest", minRest));
	if (_ruleViolation.ExistRuleViolation(rv))
		return;
	_ruleViolation.AddRuleViolations(rv);
}

