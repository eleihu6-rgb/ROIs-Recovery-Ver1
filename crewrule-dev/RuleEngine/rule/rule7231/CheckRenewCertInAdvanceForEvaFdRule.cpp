#include "CheckRenewCertInAdvanceForEvaFdRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "RuleParams.h"
#include "../utils/StringUtils.h"
#include "../utils/TimeUtils.h"
#include "CheckRenewCertInAdvanceForEvaFdRuleParam.h"

#include <bitset>

inline static bool ignoreRoster(const long long rosterId, const map<string, set<long long>>& validRosterIdsMap, const string& qual) {
	auto iterValid = validRosterIdsMap.find(qual);
	if (iterValid != validRosterIdsMap.end()) {
		//已经检查合法的rosterId集合，后续不需要在检查。
		auto& validRosterIds = iterValid->second;
		if (validRosterIds.find(rosterId) != validRosterIds.end()) {
			return true;
		}
	}
	return false;
}

//按crew检查
bool CheckRenewCertInAdvanceForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
	if (this->_ruleParams.empty() || crew == nullptr) {
		return true;
	}

	bool passAllRule = true;

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : crew->rosterList) {
		rosters.emplace_back(roster.get());
	}

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER || rosters.empty())
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}
	//const auto& crew = this->_dbData->crewIdMap.at(rosters[0]->idcrew);
	_ruleViolation.SetParam("crew_id", crew->idCrew);

	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime))
			continue;
		_ruleViolation.SetRuleParam(ruleParam);

		if (ruleParam._certificateTypes == "*" || ruleParam._certificateTypes.empty()) {
			//场景1：检查训练课程能否安排在节假日和周末
			bool valid = CheckRule(rosters, crew, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
			continue;
		}
		//场景2：检查资质过期前需要安排XX任务
		map<string, map<long long, tuple<const ROSTER*, const Segment*>>> exceptionAssignedRosterMap;//异常分配的Roster（检查时间段之外分配的Roster), map<资质,map<rosterId,tuple<roster,segment>>
		map<string, set<long long>> validRosterIdsMap;//记录已经检查合法的rosterId集合，后续不需要在检查。map<资质,已经检查合法的rosterId集合>
		for (auto& qual : crew->qualificationListInDb) {
			if ((qual->expiryUtc > 0 && checkedStartTime > qual->expiryUtc) || (qual->issuedUtc > 0 && checkedEndTime < qual->issuedUtc)) {
				//资质有效期在检查时间[checkedStartTime, checkedEndTime]之外，不需要检查
				continue;
			}

			_ruleViolation.SetParam("qualType", qual->qual);
			if (!ruleParam.MatchCertificate(qual, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 24 * 3600)) {
				continue;
			}

			//获得某个时间段内的roster（包含交集）
			time_t endTimeUtc = GetEndTimeUtc(qual->expiryUtc, crew, ruleParam);
			time_t startTimeUtc = qual->expiryUtc - (time_t)ruleParam._renewalWindowUpper * 24 * 60 * 60 + 1;
			_ruleViolation.SetParam("checkedStartTimeUtc", StringUtils::lltos(startTimeUtc));
			_ruleViolation.SetParam("checkedEndTimeUtc", StringUtils::lltos(endTimeUtc));

			//获得从[检查开始时间(expiryUtc(qual) - renewalWindowUpper),资质过期时间(expiryUtc(qual))]之间所有的Roster
			auto allAssignedRosters = GetRenewalCertRosters(exceptionAssignedRosterMap, rosters, crew, startTimeUtc, endTimeUtc, qual, ruleParam);
			if (allAssignedRosters.empty()) {
				passAllRule = false;
				//待检查的roster为空，说明没有安排特定任务，此时也违规
				ThrowRuleViolationForNoAssigment(ruleParam);
			}
			else {
				vector<const ROSTER*> assignedRosters;//[检查开始时间(expiryUtc(qual) - renewalWindowUpper), 检查结束时间(expiryUtc(qual) - renewalWindowLower)] 时间段Roster
				for (const auto& roster : allAssignedRosters) {
					if (TimeUtils::IsAbsoluteTimesCovered(roster->actStrUtc, roster->actRestStrUtc, startTimeUtc, endTimeUtc)) {
						assignedRosters.emplace_back(roster);
					}
				}

				bool valid = CheckRule(validRosterIdsMap, assignedRosters, crew, qual, ruleParam);
				if (!valid) {
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}
			}
		}
		
		for (auto& pair : exceptionAssignedRosterMap) {
			//分配roster不在Renewal Window时间段内
			auto& qualType = pair.first;
			_ruleViolation.SetParam("qualType", qualType);
			for (auto& pair2 : pair.second) {
				auto roster = std::get<0>(pair2.second);
				auto segment = std::get<1>(pair2.second);
				if (ignoreRoster(roster->rosterId, validRosterIdsMap, qualType)) {
					continue;
				}
				ThrowRuleViolationForOnlyRenewalWindow(roster, segment, ruleParam);
			}
		}
		
	}
	return passAllRule;
}

bool CheckRenewCertInAdvanceForEvaFdRule::CheckRule(const vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const {
	bool passAllRule = true;

	for (const auto& roster : rosters) {
		bool matched = false;
		bool valid = CheckRule(matched, roster, crew, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!this->IsCheckAllRule()) {
				break;
			}
		}
	}
	return passAllRule;
}

bool CheckRenewCertInAdvanceForEvaFdRule::CheckRule(map<string, set<long long>>& validRosterIdsMap, const vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const std::shared_ptr<CREW_QUALIFICATION>& qual, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const {
	bool passAllRule = true;

	for (const auto& roster : rosters) {

		if (ignoreRoster(roster->rosterId, validRosterIdsMap, qual->qual)) {
			continue;
        }

		bool matched = false;
		bool valid = CheckRule(matched, roster, crew, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!this->IsCheckAllRule()) {
				break;
			}
		}
		if (valid && matched) {
			auto iter = validRosterIdsMap.find(qual->qual);
			if (iter == validRosterIdsMap.end()) {
				set<long long> rosterIds;
				rosterIds.insert(roster->rosterId);
				validRosterIdsMap[qual->qual] = rosterIds;
			}
			else {
				iter->second.insert(roster->rosterId);
			}
		}
	}
	return passAllRule;
}

bool CheckRenewCertInAdvanceForEvaFdRule::CheckRule(bool& matched, const ROSTER* roster, const std::shared_ptr<CREW>& crew, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const {
	bool passAllRule = true;
	if (roster->pairing == nullptr) {
		_ruleViolation.SetParam("assignment", roster->qualifier);
		if (ruleParam.MatchParam(roster, crew)) {
			matched = true;
			if (!ruleParam.CheckHoliday(roster, crew)) {
				ThrowRuleViolationForHoliday(roster, nullptr, ruleParam);
				return false;
			}

			if (!ruleParam.CheckWeekDay(roster, crew)) {
				ThrowRuleViolationForWeekday(roster, nullptr, ruleParam);
				return false;
			}
		}
	}
	else {
		for (const auto& segment : roster->pairing->getSegmentsRead()) {
			_ruleViolation.SetParam("assignment", segment->getAssignment());
			bool valid = CheckRule(matched, roster, segment, crew, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckRenewCertInAdvanceForEvaFdRule::CheckRule(bool& matched, const ROSTER* roster, const Segment* segment, const std::shared_ptr<CREW>& crew, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const {
	bool valid = true;
	if (ruleParam.MatchParam(segment, roster, crew)) {
		matched = true;
		if (!ruleParam.CheckHoliday(segment, crew)) {
			ThrowRuleViolationForHoliday(roster, segment, ruleParam);
			return false;
		}

		if (!ruleParam.CheckWeekDay(segment, crew)) {
			ThrowRuleViolationForWeekday(roster, segment, ruleParam);
			return false;
		}
	}
	return valid;
}

time_t CheckRenewCertInAdvanceForEvaFdRule::GetEndTimeUtc(const time_t qualExpiryUtc, const std::shared_ptr<CREW>& crew, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const {
	time_t endTimeUtc = qualExpiryUtc;
	//time_t endTimeUtc = qualExpiryUtc - (time_t)24 * 60 * 60;
	int workDays = 0;
	for (int i = 0; i < 1000; i++) {//循环最大1000避免死循环
		//向前滚动一天
		time_t checkEndTime = endTimeUtc;
		time_t checkStartTime = endTimeUtc - (time_t)24 * 60 * 60 + 1;

		if (ruleParam.CheckHoliday(checkStartTime, checkEndTime, crew)	&& ruleParam.CheckWeekDay(checkStartTime, checkEndTime, crew)) {
			//对应工作日则增加1天
			workDays++;

			if (workDays >= ruleParam._renewalWindowLower) {
				return endTimeUtc;
			}
		}
		endTimeUtc -= (time_t)24 * 60 * 60;
	}
	//异常时退出
	return qualExpiryUtc - (time_t)ruleParam._renewalWindowLower * 24 * 60 * 60;
}

static inline void removeExceptionAssignedRosterMap(map<string, map<long long, tuple<const ROSTER*, const Segment*>>>& exceptionAssignedRosterMap, const string& qual, const long long rosterId) {
	auto iterAssignedRoster = exceptionAssignedRosterMap.find(qual);
	if (iterAssignedRoster == exceptionAssignedRosterMap.end()) {
		return;
	}
	auto iter = iterAssignedRoster->second.find(rosterId);
	if (iter != iterAssignedRoster->second.end()) {
		iterAssignedRoster->second.erase(rosterId);
	}
}

static inline void updateExceptionAssignedRosterMap(map<string, map<long long, tuple<const ROSTER*, const Segment*>>>& exceptionAssignedRosterMap, const string& qual, const ROSTER* roster, const Segment* segment) {
	auto iterAssignedRoster = exceptionAssignedRosterMap.find(qual);
	if (iterAssignedRoster == exceptionAssignedRosterMap.end()) {
		map<long long, tuple<const ROSTER*, const Segment*>> rosterSegmentMap;
		rosterSegmentMap[roster->rosterId] = std::make_tuple(roster, segment);
		exceptionAssignedRosterMap[qual] = rosterSegmentMap;
	}
	else {
		iterAssignedRoster->second[roster->rosterId] = std::make_tuple(roster, segment);
	}
}

vector<const ROSTER*> CheckRenewCertInAdvanceForEvaFdRule::GetRenewalCertRosters(map<string, map<long long, tuple<const ROSTER*, const Segment*>>>& exceptionAssignedRosterMap, const vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const time_t startTimeUtc, const time_t endTimeUtc, const std::shared_ptr<CREW_QUALIFICATION>& qual, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const {
	vector<const ROSTER*> results;
	for (const auto& roster : rosters) {

		if ( (qual->issuedUtc > 0 && roster->strUtc < qual->issuedUtc) || (qual->expiryUtc > 0 && roster->actRestStrUtc > qual->expiryUtc)) {
			//roster在资质有效期之外，不需要检查
			continue;
		}
		if (roster->pairing == nullptr) {
			if (ruleParam.MatchParam(roster, crew)) {
				if (TimeUtils::IsAbsoluteTimesCovered(roster->actStrUtc, roster->actRestStrUtc, startTimeUtc, endTimeUtc)) {
					results.emplace_back(roster);

					removeExceptionAssignedRosterMap(exceptionAssignedRosterMap, qual->qual, roster->rosterId);
				}
				else {
					//与检查时间段不重叠，则忽略
					updateExceptionAssignedRosterMap(exceptionAssignedRosterMap, qual->qual, roster, nullptr);
				}
			}
		}
		else {
			for (const auto& segment : roster->pairing->getSegmentsRead()) {
				if (ruleParam.MatchParam(segment, roster, crew)) {
					if (TimeUtils::IsAbsoluteTimesCovered(roster->actStrUtc, roster->actRestStrUtc, startTimeUtc, endTimeUtc)) {
						results.emplace_back(roster);

						removeExceptionAssignedRosterMap(exceptionAssignedRosterMap, qual->qual, roster->rosterId);
					}
					else {
						//与检查时间段不重叠，则忽略
						updateExceptionAssignedRosterMap(exceptionAssignedRosterMap, qual->qual, roster, segment);
					}
				}
			}
		}
	}
	return results;
}

void CheckRenewCertInAdvanceForEvaFdRule::ThrowRuleViolationForHoliday(const ROSTER* roster, const Segment* segment, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const {
	string assignment = _ruleViolation.GetParam("assignment");
	string courseCode = _ruleViolation.GetParam("courseCode");
	string qualType = _ruleViolation.GetParam("qualType");
	//机组人员法定假日不能安排XXX任务
	string msg;

	if (ruleParam._certificateTypes == RuleParamConstant::IGNORED || ruleParam._certificateTypes.empty()) {
		if (courseCode.empty()) {
			//msg = "Assignment ({0:assignment}) cannot be assigned on holidays.";
			//msg = StringUtils::Format(msg, assignment);
			msg = "Assignment ({0:assignment}) ({1:courseCode}) can be assigned only within the {2:renewalWindow} days, and not on holidays.";
			msg = StringUtils::Format(msg, assignment, ruleParam._courseCodes, ruleParam._renewalWindow);
		}
		else {
			//msg = "Assignment ({0:assignment}) ({1:courseCode}) cannot be assigned on holidays.";
			//msg = StringUtils::Format(msg, assignment, courseCode);
			msg = "Assignment ({0:assignment}) ({1:courseCode}) can be assigned only within the {2:renewalWindow} days, and not on holidays.";
			msg = StringUtils::Format(msg, assignment, courseCode, ruleParam._renewalWindow);
		}
	}
	else {
		msg = "Assignment ({0:assignment}) ({1:certificateTypes}) can be assigned only within the {2:renewalWindow} days, and not on holidays.";
		msg = StringUtils::Format(msg, assignment, qualType, ruleParam._renewalWindow);
	}


	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = roster->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getRestStartUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->dutySequenceNumber = segment->getDutySeq();
		rv->segmentId = segment->getDBId();
		rv->startDTUtc = segment->getStartTimeUtcAct();
		rv->endDTUtc = segment->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("assignment", assignment));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("qualType", qualType));
	rv->operation_result.insert(pair<string, string>("_courseCodes", ruleParam._courseCodes));
	rv->operation_result.insert(pair<string, string>("_types", ruleParam._strTypes));
	rv->operation_result.insert(pair<string, string>("_isSkipHoliday", ruleParam._isSkipHoliday ? "true" : "false"));
	rv->operation_result.insert(pair<string, string>("_holidayCountries", ruleParam._holidayCountries));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckRenewCertInAdvanceForEvaFdRule::ThrowRuleViolationForWeekday(const ROSTER* roster, const Segment* segment, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const {
	string assignment = _ruleViolation.GetParam("assignment");
	string courseCode = _ruleViolation.GetParam("courseCode");
	string qualType = _ruleViolation.GetParam("qualType");

	//机组人员分配任务不能安排在休息日
	string msg;
	if (ruleParam._certificateTypes == RuleParamConstant::IGNORED || ruleParam._certificateTypes.empty()) {

		if (courseCode.empty()) {
			//msg = "Assignment ({0:assignment}) cannot be assigned on days off.";
			//msg = StringUtils::Format(msg, assignment);
			msg = "Assignment ({0:assignment}) ({1:courseCode}) can be assigned only within the {2:renewalWindow} days, and not on days off.";
			msg = StringUtils::Format(msg, assignment, ruleParam._courseCodes, ruleParam._renewalWindow);
		}
		else {
			//msg = "Assignment ({0:assignment}) ({1:courseCode}) cannot be assigned on days off.";
			//msg = StringUtils::Format(msg, assignment, courseCode);
			msg = "Assignment ({0:assignment}) ({1:courseCode}) can be assigned only within the {2:renewalWindow} days, and not on days off.";
			msg = StringUtils::Format(msg, assignment, courseCode, ruleParam._renewalWindow);
		}
	}
	else {
		msg = "Assignment ({0:assignment}) ({1:certificateTypes}) can be assigned only within the {2:renewalWindow} days, and not on days off.";
		msg = StringUtils::Format(msg, assignment, qualType, ruleParam._renewalWindow);
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = roster->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getRestStartUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->dutySequenceNumber = segment->getDutySeq();
		rv->segmentId = segment->getDBId();
		rv->startDTUtc = segment->getStartTimeUtcAct();
		rv->endDTUtc = segment->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("assignment", assignment));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("qualType", qualType));
	rv->operation_result.insert(pair<string, string>("_courseCodes", ruleParam._courseCodes));
	rv->operation_result.insert(pair<string, string>("_types", ruleParam._strTypes));
	rv->operation_result.insert(pair<string, string>("_isSkipHoliday", ruleParam._isSkipHoliday ? "true" : "false"));
	rv->operation_result.insert(pair<string, string>("_holidayCountries", ruleParam._holidayCountries));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckRenewCertInAdvanceForEvaFdRule::ThrowRuleViolationForOnlyRenewalWindow(const ROSTER* roster, const Segment* segment, const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const {
	string assignment = segment != nullptr ? segment->getAssignment() : roster->qualifier;
	string courseCode = _ruleViolation.GetParam("courseCode");
	string qualType = _ruleViolation.GetParam("qualType");

	//任务只能在资质过期前n-m天内分配
	string msg;
	if (ruleParam._assignments == "*") {
		msg = "Training course {0:courseCodes} can be assigned only before certificate ({1:certificateTypes}) ({2:renewalWindow}) expiration.";
		msg = StringUtils::Format(msg, ruleParam._courseCodes, qualType, ruleParam._renewalWindow);
	}
	else if (ruleParam._courseCodes == "*") {
		msg = "Assignment ({0:assignment}) can be assigned only before certificate ({1:certificateTypes}) ({2:renewalWindow}) expiration.";
		msg = StringUtils::Format(msg, assignment, qualType, ruleParam._renewalWindow);
	}
	else {
		msg = "Assignment ({0:assignment} {1:courseCodes}) can be assigned only before certificate ({2:certificateTypes}) ({3:renewalWindow}) expiration.";
		msg = StringUtils::Format(msg, assignment, ruleParam._courseCodes, qualType, ruleParam._renewalWindow);
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = roster->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getRestStartUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->dutySequenceNumber = segment->getDutySeq();
		rv->segmentId = segment->getDBId();
		rv->startDTUtc = segment->getStartTimeUtcAct();
		rv->endDTUtc = segment->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("assignment", assignment));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("qualType", qualType));
	rv->operation_result.insert(pair<string, string>("_courseCodes", ruleParam._courseCodes));
	rv->operation_result.insert(pair<string, string>("_types", ruleParam._strTypes));
	rv->operation_result.insert(pair<string, string>("_isSkipHoliday", ruleParam._isSkipHoliday ? "true" : "false"));
	rv->operation_result.insert(pair<string, string>("_holidayCountries", ruleParam._holidayCountries));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckRenewCertInAdvanceForEvaFdRule::ThrowRuleViolationForNoAssigment(const CheckRenewCertInAdvanceForEvaFdRuleParam& ruleParam) const {
	string qualType = _ruleViolation.GetParam("qualType");
	string checkedStartTimeUtc = _ruleViolation.GetParam("checkedStartTimeUtc");
	string checkedEndTimeUtc = _ruleViolation.GetParam("checkedEndTimeUtc");

	//机组人员在资质（XXX）过期前未分配XXX任务
	string msg;
	if (ruleParam._assignments == "*") {
		msg = "Crew isn't assigned training course {0:courseCodes} before certificate ({1:certificateTypes}) ({2:renewalWindow}) expiration.";
		msg = StringUtils::Format(msg, ruleParam._courseCodes, qualType, ruleParam._renewalWindow);
	}
	else if (ruleParam._courseCodes == "*") {
		msg = "Crew isn't assigned {0:assignment} assignment before certificate ({1:certificateTypes}) ({2:renewalWindow}) expiration.";
		msg = StringUtils::Format(msg, ruleParam._assignments, qualType, ruleParam._renewalWindow);
	}
	else {
		msg = "Crew isn't assigned {0:assignment} ({1:courseCodes}) assignment before certificate ({2:certificateTypes}) ({3:renewalWindow}) expiration.";
		msg = StringUtils::Format(msg, ruleParam._assignments, ruleParam._courseCodes, qualType, ruleParam._renewalWindow);
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = -1;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = -1;
	rv->startDTUtc = StringUtils::stoll(checkedStartTimeUtc, 0);
	rv->endDTUtc = StringUtils::stoll(checkedEndTimeUtc, 0);
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("assignment", ruleParam._assignments));
	rv->operation_result.insert(pair<string, string>("certificateTypes", qualType));
	rv->operation_result.insert(pair<string, string>("_types", ruleParam._strTypes));
	rv->operation_result.insert(pair<string, string>("_isSkipHoliday", ruleParam._isSkipHoliday ? "true" : "false"));
	rv->operation_result.insert(pair<string, string>("_holidayCountries", ruleParam._holidayCountries));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckRenewCertInAdvanceForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckRenewCertInAdvanceForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}
