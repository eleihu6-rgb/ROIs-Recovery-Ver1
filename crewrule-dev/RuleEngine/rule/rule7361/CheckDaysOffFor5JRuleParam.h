/**
 * @file CheckDaysOffFor5JRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CheckDaysOffFor5JRuleParam_H_
#define _CheckDaysOffFor5JRuleParam_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "CheckDaysOffFor5JSecondRuleParam.h"
#include "CheckDaysOffDefinitionFor5JRuleParam.h"

class CheckDaysOffFor5JRule;

class CheckDaysOffFor5JRuleParam : public RuleParam {
	friend class CheckDaysOffFor5JRule;
public:

	vector<CheckDaysOffDefinitionFor5JRuleParam>& GetDefinitionParams() const {
		return this->_definitionParams;
	}

	void SetDefinitionParams(const vector<CheckDaysOffDefinitionFor5JRuleParam>& definitionParams) {
		this->_definitionParams = definitionParams;
	}

	vector<CheckDaysOffFor5JSecondRuleParam>& GetSecondCaseParams() const {
		return this->_secondCaseParams;
	}

	void SetCheckMinNumberOfDaysOffPatternForPRRuleParams(const vector<CheckDaysOffFor5JSecondRuleParam>& secondCaseParams) {
		this->_secondCaseParams = secondCaseParams;
	}

	bool Empty() const;


private:
	explicit CheckDaysOffFor5JRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7361;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	mutable vector<CheckDaysOffDefinitionFor5JRuleParam> _definitionParams;
	mutable vector<CheckDaysOffFor5JSecondRuleParam> _secondCaseParams;


	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	std::vector<std::unique_ptr<RestPeriod>> GetRestPeriods(const std::vector<const ROSTER*>& rosters, const string base, const time_t checkStart, const time_t checkEnd, const std::shared_ptr<CrewDataContext>& dbData) const;

	time_t GetWorkEndTimeUTCForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest, const string base, const string homeBase) const;

	time_t GetWorkEndTimeLocForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest, const string base, const string homeBase) const;

	bool IsConsecutiveRest(const time_t prevRestEndTimeUtc, const ROSTER* currRoster) const;

	bool IsConsecutiveRest(const time_t prevRestEndTimeUtc, const Duty* currDuty) const;
	
	string GetCheckPeriod() const;
};

#endif //_CheckDaysOffFor5JRuleParam_H_
