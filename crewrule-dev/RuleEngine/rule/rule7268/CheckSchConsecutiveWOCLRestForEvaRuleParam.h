#pragma once
#ifndef _CHECKSCHCONSECUTIVEWOCLRESTFOREVARULEPARAM_H_
#define _CHECKSCHCONSECUTIVEWOCLRESTFOREVARULEPARAM_H_
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckSchConsecutiveWOCLRestForEvaRule;

class CheckSchConsecutiveWOCLRestForEvaRuleParam : public RuleParam {
	friend class CheckSchConsecutiveWOCLRestForEvaRule;
private:
	explicit CheckSchConsecutiveWOCLRestForEvaRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7268;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	enum class ParamLocation {
		RANKS,
		BASES,
		FLEETS,
		TEAMS,
		WOCL_START,
		WOCL_END,
		MAX_SPACE_BETWEEN_WOCLS,
		CONSECUTIVE_WOCL_NUMBER,
		MIN_REST

	};

	std::vector<std::string> _ranks;
	std::vector<std::string> _bases;
	std::vector<std::string> _fleets;
	std::vector<std::string> _teams;
	int _woclStart{};
	int _woclEnd{};
	int _maxConsecutiveWoclNumber{};
	std::vector<int> _minRests;

	void ParseParam(const DBRule& dbRule);

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

};
#endif //_CHECKSCHCONSECUTIVEWOCLRESTFOREVARULEPARAM_H_
