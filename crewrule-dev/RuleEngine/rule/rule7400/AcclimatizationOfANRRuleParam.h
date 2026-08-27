/**
 * @file AcclimatizationOfANRRuleParam.h
 */

#ifndef _ACCLIMATIZATION_OF_ANR_RULE_PARAM_H_
#define _ACCLIMATIZATION_OF_ANR_RULE_PARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>

class AcclimatizationOfANRRule;

class AcclimatizationOfANRRuleParam : public RuleParam {
    friend class AcclimatizationOfANRRule;
public:
    explicit AcclimatizationOfANRRuleParam(const Rule* rule) : RuleParam(rule) {}

    constexpr static unsigned int RuleFuncId = 7400;

private:
    // minimum number of consecutive local nights required to be acclimatized
    int _minLocalNights{3};
    // output state when acclimatized to the current duty timezone
    std::string _accStateCurrentTz{"A"};
    // output state when acclimatized time remains at the previous/reference timezone
    std::string _accStatePrevTz{"B"};

    void ParseParam(const std::string& paramString);
    void ParseParam(const DBRule& dbRule);
};

#endif // _ACCLIMATIZATION_OF_ANR_RULE_PARAM_H_

