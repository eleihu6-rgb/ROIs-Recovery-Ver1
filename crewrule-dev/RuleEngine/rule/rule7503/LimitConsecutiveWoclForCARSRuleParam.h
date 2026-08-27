#ifndef _LIMITCONSECUTIVEWOCLFORCARSRULEPARAM_H_
#define _LIMITCONSECUTIVEWOCLFORCARSRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include <string>
#include <vector>

class LimitConsecutiveWoclForCARSRule;

class LimitConsecutiveWoclForCARSRuleParam : public RuleParam {
	friend class LimitConsecutiveWoclForCARSRule;
private:
	explicit LimitConsecutiveWoclForCARSRuleParam(const Rule* rule) : RuleParam(rule) {}

	constexpr static unsigned int RuleFuncId = 7503;

	std::vector<std::string> _bases;
	std::vector<std::string> _ranks;
	std::vector<std::string> _fleets;
	std::vector<std::string> _teams;
	int _woclStart{};
	int _woclEnd{};
	int _maxConsecutiveWoclNumber{};

	void ParseParam(const std::string& paramString);
	void ParseParam(const DBRule& dbRule);

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
};

#endif
