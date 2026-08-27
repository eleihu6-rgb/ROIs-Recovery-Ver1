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
#include "utils/RosterUtils.h"
#include "utils/StringUtils.h"
#include "utils/CompetenceValidationUtils.h"

//获得资质宽限期后的过期时间
static inline time_t getGraceExpiry(const time_t expiryUtc, const int iGracePeriod, const string& strGraceUnit, const string& weekdayStartFrom, const int offsetMinutes) {
	time_t graceExpiryUtc = expiryUtc;//资质宽限期后的过期时间
	
	if (strGraceUnit == "CD") {
		time_t expiryLocalEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(expiryUtc, offsetMinutes) + 24 * 3600;
		graceExpiryUtc = expiryLocalEnd + (time_t)iGracePeriod * 24 * 3600 - 1;
	}
	else if (strGraceUnit == "CW") {
		time_t expiryLocalEnd = Utility::GetInstancePtr()->getLocalWeekEndInUTC(expiryUtc, weekdayStartFrom, offsetMinutes);
		graceExpiryUtc = Utility::GetInstancePtr()->addWeeks(expiryLocalEnd, iGracePeriod);
	}
	else if (strGraceUnit == "CM") {
		time_t expiryLocalEnd = Utility::GetInstancePtr()->getLocalMonthEndInUTC(expiryUtc, offsetMinutes);
		graceExpiryUtc = Utility::GetInstancePtr()->addMonths(expiryLocalEnd, iGracePeriod);
	}
	else if (strGraceUnit == "CY") {
		time_t expiryLocalEnd = Utility::GetInstancePtr()->getLocalYearEndInUTC(expiryUtc, offsetMinutes);
		graceExpiryUtc = Utility::GetInstancePtr()->addYears(expiryLocalEnd, iGracePeriod);
	}
	else if (strGraceUnit == "EM") { 
		// EM - End of Month 举例说明：0 EM，说明有效期延长到当前资质过期日期的月底；1 EM - 有效期延长到下月月底。
		time_t expiryLocalEnd = Utility::GetInstancePtr()->getLocalMonthEndInUTC(expiryUtc, offsetMinutes);
		if (iGracePeriod == 0) {
			//iGracePeriod==0 EM，说明有效期延长到当前资质过期日期的月底
			graceExpiryUtc = expiryLocalEnd;
		}
		else {
			//iGracePeriod，EM - 有效期延长到下n个月月底。
			expiryLocalEnd = Utility::GetInstancePtr()->addMonths(expiryLocalEnd, iGracePeriod);
			graceExpiryUtc = Utility::GetInstancePtr()->getLocalMonthEndInUTC(expiryLocalEnd, offsetMinutes);
		}
	}
	return graceExpiryUtc;
}

//PTN_REQUIRED_CREW
bool LegalityChecker::checkPtnRequiredCrew(RULE_LEGALITY * pCrew, const DBRule* singleRule){
	bool breturn = true;
	if (pCrew->crewIndex < 0 || pCrew->crewIndex >= (int)this->_dbData->crewList.size())
	{
		printf("Exception in 8106: crew index out of index!");
		return true;
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	if (crew->rosterList.size() == 0)
		return true;
	if (this->_application == ROSTER_OPTIMIZER) {
		if (!crew->rosterList[pCrew->RosterIndex]->pairing)
			return true;
	}
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string pairingAttributes, assignmentGroups = "*", assignments = "*", crewNationalities, bases, actingRanks, fleets,
		requiredQualifications,crewTeams;
	string strGracePeriod = "*", strGraceUnit = "*";
	
	//初步解析参数
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "PAIRING ATTRIBUTES")
			pairingAttributes = headeValue;
		else if (header == "ASSIGNMENT GROUPS")
			assignmentGroups = headeValue;
		else if (header == "ASSIGNMENTS")
			assignments = headeValue;
		else if (header == "CREW NATIONLITIES" || header == "CREW NATIONALITIES")
			crewNationalities = headeValue;
		else if (header == "BASES")
			bases = headeValue;
		else if (header == "RANKS")
			actingRanks = headeValue;
		else if (header == "FLEETS")
			fleets = headeValue;
		else if (header == "REQUIRED QUALIFICATIONS")
			requiredQualifications = headeValue;
		else if (header == "CREW TEAMS")
			crewTeams = headeValue;
		else if (header == "GRACE PERIOD")
			strGracePeriod = strToUpper(headeValue);
		else if (header == "UNIT")
			strGraceUnit = headeValue;

	}
	//进一步解析
	vector<string> pairingAttributeVec, assignmentGruopVec, assignmentVec, crewNationalityVec, baseVec, actingRankVec, fleetVec,
		requiredQualificationVec, crewTeamVec;
	int gracePeriod = atoi(strGracePeriod.c_str());
	split(pairingAttributes, '|', pairingAttributeVec);
	split(assignmentGroups, '|', assignmentGruopVec);
	split(assignments, '|', assignmentVec);
	split(crewNationalities, '|', crewNationalityVec);
	split(requiredQualifications, '|', requiredQualificationVec);
	//验证crew是否满足要求
	bool isOkCrew = true;
	if (crewNationalityVec[0] != "*"&&
		find(crewNationalityVec.begin(), crewNationalityVec.end(), crew->nationality) == crewNationalityVec.end()){
		isOkCrew = false;
	}

	string base = crew->getPrimeBase();
	//OP1489, EVA only use TPE base regardless crew base
	if (base == "" || this->_dbData->scenario.airline == "BR")
		base = "TPE";

	auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	string weekdayStartFrom = this->_dbData->getWeekdayStartFrom();
	//time_t lCheckedStart = 0, lCheckedEnd = 0;
	//if (this->_application == ROSTER_OPTIMIZER)
	//{
	//	lCheckedStart = this->_dbData->scenario.startDtUTC;
	//	lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	//}
	//else
	//{
	//	lCheckedStart = crew->rosterList[0]->actStrUtc;
	//	lCheckedEnd = crew->rosterList[crew->rosterList.size() - 1]->restStrUtc;
	//}
	
	//遍历RosterList 针对pairing筛选
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
	for (auto r : crew->rosterList){
		auto tmpQualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(r.get(), this->_dbData->qualExtensionConfigMap);
		qualExtensionConfigsForQualMap.insert(tmpQualExtensionConfigsForQualMap.begin(), tmpQualExtensionConfigsForQualMap.end());

		bool isOkPairing = false;

		if (this->_application == ROSTER_OPTIMIZER && (r->pairing != nullptr && r->pairId != this->_dbData->pairingList[pCrew->PairingIndex]->getDbId()))
			continue;

		if (!Utility::GetInstancePtr()->isCrewQualified(crew, bases, actingRanks, fleets, crewTeams, "*", r->getStartTimeUtcAct(), r->getRestStartUtcAct())) {
			isOkCrew = false;
		}
		if (!isOkCrew)
			continue;

		bool isQual = false;
		for (auto qual : crew->qualificationList)
		{
			auto effTime = qual->issuedUtc;
			auto expTime = qual->expiryUtc;
			if (!strGracePeriod.empty() && strGracePeriod != "*") {
				expTime = getGraceExpiry(qual->expiryUtc, gracePeriod, strGraceUnit, weekdayStartFrom, offsetMinutes);
			}
			if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
				auto qualPeriod = RosterUtils::GetQualExtension(qual, qualExtensionConfigsForQualMap);
				effTime = std::get<0>(qualPeriod);
				expTime = std::get<1>(qualPeriod);
			}

			if (requiredQualificationVec[0] == "*" || (find(requiredQualificationVec.begin(), requiredQualificationVec.end(), qual->qual) != requiredQualificationVec.end()
				&& CompetenceValidationUtils::IsValid(qual, r->getStartTimeUtcAct(), r->getRestStartUtcAct()))) {
				isQual = true;
				break;
			}
		}

		bool isOkAttribute = false;
		if (pairingAttributeVec[0] == "*") isOkAttribute = true;
		for (auto att : pairingAttributeVec){
			if (r->pairing != nullptr && r->pairing->getAttribute().find(att) != r->pairing->getAttribute().npos){
				isOkAttribute = true;
				break;
			}
			else if (!r->pairing && r->attribute.find(att) != r->attribute.npos) {
				isOkAttribute = true;
				break;
			}
		}
		if (!isOkAttribute)continue;

		bool isOkAssignment = false;
		if (!assignmentVec.empty() && assignmentVec[0] != "*") {
			if (r->pairing == nullptr) {
                if (std::find(assignmentVec.begin(), assignmentVec.end(), r->qualifier) != assignmentVec.end()) {
					isOkAssignment = true;
				}
			}
			else {
                for (auto& duty : r->pairing->getDutyVec()) {
					for (auto& segment : duty->getSegmentsRead()) {
						if (std::find(assignmentVec.begin(), assignmentVec.end(), segment->getAssignment()) != assignmentVec.end()) {
							isOkAssignment = true;
							break;
                        }
					}
				}
			}
		}
		else {
			isOkAssignment = true;
		}

		bool isOkAssignmentGroup = false;
		if (!assignmentGruopVec.empty() && assignmentGruopVec[0] != "*"){
			for (auto assignment : assignmentGruopVec){
				if (this->_dbData->isAssignmentInGroup(r->qualifier, assignment) || r->duty == assignment){
					isOkAssignmentGroup = true;
					break;
				}
			}
		}
		else{
			isOkAssignmentGroup = true;
		}

		isOkPairing = isOkAssignment && isOkAssignmentGroup;
		if (isOkPairing && (isOkCrew == false || isQual == false)){
			breturn = false;

			string errorMsg = "The crew member ({0:crewId}) is not qualified for this pairing (Attributes={1:pairingAttributes}, Pairing ID={2:pairingId}). Required qualifications: ({3:requiredQualifications}).";
			errorMsg = StringUtils::Format(errorMsg, r->idcrew, pairingAttributes, r->pairId, requiredQualifications);

			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->idRule = singleRule->idRule;
			rv->crewId = crew->idCrew;
			rv->rosterId = r->rosterId;
			rv->pairingId = r->pairId;
			rv->startDTUtc = r->getStartTimeUtcAct();
			rv->endDTUtc = r->getEndTimeUtcAct();
			rv->violation_msg = errorMsg;
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			this->addRuleViolations(rv, singleRule);
		}
	}
	return breturn;
}

// for RO
bool LegalityChecker::checkPtnRequiredCrewForPairing(SharedPtr<CREW> crew, Pairing* pairing, const DBRule* singleRule) {
	bool breturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string pairingAttributes, assignmentGroups = "*", assignments = "*", crewNationalities, bases, actingRanks, fleets,
		requiredQualifications, crewTeams;
	string strGracePeriod = "*", strGraceUnit = "*";
	//初步解析参数
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "PAIRING ATTRIBUTES")
			pairingAttributes = headeValue;
		else if (header == "ASSIGNMENT GROUPS")
			assignmentGroups = headeValue;
		else if (header == "ASSIGNMENTS")
			assignments = headeValue;
		else if (header == "CREW NATIONLITIES" || header == "CREW NATIONALITIES")
			crewNationalities = headeValue;
		else if (header == "BASES")
			bases = headeValue;
		else if (header == "RANKS")
			actingRanks = headeValue;
		else if (header == "FLEETS")
			fleets = headeValue;
		else if (header == "REQUIRED QUALIFICATIONS")
			requiredQualifications = headeValue;
		else if (header == "CREW TEAMS")
			crewTeams = headeValue;
		else if (header == "GRACE PERIOD")
			strGracePeriod = strToUpper(headeValue);
		else if (header == "UNIT")
			strGraceUnit = headeValue;

	}
	//进一步解析
	vector<string> pairingAttributeVec, assignmentGruopVec, assignmentVec, crewNationalityVec, baseVec, actingRankVec, fleetVec,
		requiredQualificationVec, crewTeamVec;
	int gracePeriod = atoi(strGracePeriod.c_str());
	split(pairingAttributes, '|', pairingAttributeVec);
	split(assignmentGroups, '|', assignmentGruopVec);
	split(assignments, '|', assignmentVec);
	split(crewNationalities, '|', crewNationalityVec);
	split(requiredQualifications, '|', requiredQualificationVec);
	//验证crew是否满足要求
	bool isOkCrew = true;
	if (crewNationalityVec[0] != "*" &&
		find(crewNationalityVec.begin(), crewNationalityVec.end(), crew->nationality) == crewNationalityVec.end()) {
		isOkCrew = false;
	}
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	lCheckedStart = this->_dbData->scenario.startDtUTC;
	lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, bases, actingRanks, fleets, crewTeams, "*", lCheckedStart, lCheckedEnd)) {
		isOkCrew = false;
	}

	if (pairing->getDbId() == 0) return true;

	string base = crew->getPrimeBase();
	//OP1489, EVA only use TPE base regardless crew base
	if (base == "" || this->_dbData->scenario.airline == "BR")
		base = "TPE";

	auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	string weekdayStartFrom = this->_dbData->getWeekdayStartFrom();

	bool isOkPairing = false;

	bool isQual = false;
	for (auto& qual : crew->qualificationList)
	{
		auto effTime = qual->issuedUtc;
		auto expTime = qual->expiryUtc;
		if (!strGracePeriod.empty() && strGracePeriod != "*") {
			expTime = getGraceExpiry(qual->expiryUtc, gracePeriod, strGraceUnit, weekdayStartFrom, offsetMinutes);
		}

		if (requiredQualificationVec[0] == "*" || (find(requiredQualificationVec.begin(), requiredQualificationVec.end(), qual->qual) != requiredQualificationVec.end()
			&& CompetenceValidationUtils::IsValid(qual, pairing->getStartTimeUtcAct(), pairing->getEndTimeUtc()))) {
			isQual = true;
			break;
		}
	}

	bool isOkAttribute = false;
	if (pairingAttributeVec[0] == "*")isOkAttribute = true;
	for (auto att : pairingAttributeVec) {
		if (pairing->getAttribute().find(att) != pairing->getAttribute().npos) {
			isOkAttribute = true;
			break;
		}
	}
	if (!isOkAttribute) return true;

	bool isOkAssignment = false;
	if (!assignmentVec.empty() && assignmentVec[0] != "*") {
		for (auto& duty : pairing->getDutyVec()) {
			for (auto& segment : duty->getSegmentsRead()) {
				if (std::find(assignmentVec.begin(), assignmentVec.end(), segment->getAssignment()) != assignmentVec.end()) {
					isOkAssignment = true;
					break;
				}
			}
		}
	}
	else {
		isOkAssignment = true;
	}

	bool isOkAssignmentGroup = false;
	if (!assignmentGruopVec.empty() && assignmentGruopVec[0] != "*") {
		for (auto assignment : assignmentGruopVec) {
			if (this->_dbData->isAssignmentInGroup(pairing->getQualifier(), assignment) || pairing->getPrimeActivity() == assignment) {
				isOkAssignmentGroup = true;
				break;
			}
		}
	}
	else {
		isOkAssignmentGroup = true;
	}

	isOkPairing = isOkAssignment && isOkAssignmentGroup;

	if (isOkPairing && (isOkCrew == false || isQual == false)) {
		return false;
	}
	return breturn;
}