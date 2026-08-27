/**
 * @file SegmentRestrictionWOCLForEvaFdRuleParam.h
 * @brief Duty航段数的特殊限制参数
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _SEGMENTRESTRICTIONWOCLFOREVAFDRULEPARAM_H_
#define _SEGMENTRESTRICTIONWOCLFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

#include "SegmentRestrictionDayNightForEvaFdRuleParam.h"
#include "SegmentRestrictionFDPNightForEvaFdRuleParam.h"

class CheckSegmentRestrictionWOCLForEvaFdRule;

class SegmentRestrictionWOCLForEvaFdRuleParam : public RuleParam {
friend class CheckSegmentRestrictionWOCLForEvaFdRule;
private:
    explicit SegmentRestrictionWOCLForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7204;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 0;

	mutable vector<SegmentRestrictionDayNightForEvaFdRuleParam> _segmentRestrictionDayNightForEvaFdRuleParams;
	mutable vector<SegmentRestrictionFDPNightForEvaFdRuleParam> _segmentRestrictionFDPNightForEvaFdRuleParams;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);


public:

	vector<SegmentRestrictionDayNightForEvaFdRuleParam>& GetSegmentRestrictionDayNightForEvaFdRuleParams() const {
		return this->_segmentRestrictionDayNightForEvaFdRuleParams;
	}

	vector<SegmentRestrictionFDPNightForEvaFdRuleParam>& GetSegmentRestrictionFDPNightForEvaFdRuleParams() const {
		return this->_segmentRestrictionFDPNightForEvaFdRuleParams;
	}

};

#endif //_SEGMENTRESTRICTIONWOCLFOREVAFDRULEPARAM_H_
