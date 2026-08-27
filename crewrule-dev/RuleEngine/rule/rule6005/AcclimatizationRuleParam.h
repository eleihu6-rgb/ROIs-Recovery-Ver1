/**
 * @file AcclimatizationRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _ACCLIMATIZATIONRULEPARAM_H_
#define _ACCLIMATIZATIONRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "AcclimatizationStateParam.h"
#include "AdaptionPeriodParam.h"

class AcclimatizationRule;



class AcclimatizationRuleParam : public RuleParam {
friend class AcclimatizationRule;
public:

	AcclimatizationStateParam& GetAcclimatizationStateParam() const {
		return *this->_acclimatizationStateParam;
	}

	vector<AdaptionPeriodParam>& GetAdaptionPeriodParams() const {
		return this->_adaptionPeriodParams;
	}

	void SetAdaptionPeriodParams(const vector<AdaptionPeriodParam>& adaptionPeriodParams) {
		this->_adaptionPeriodParams = adaptionPeriodParams;
	}

private:
    explicit AcclimatizationRuleParam(const Rule* rule) :RuleParam(rule) {
		_acclimatizationStateParam = std::make_unique<AcclimatizationStateParam>(AcclimatizationStateParam(rule));
	};

    constexpr static unsigned int RuleFuncId = 6005;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 14;

	mutable std::unique_ptr<AcclimatizationStateParam> _acclimatizationStateParam;
	mutable vector<AdaptionPeriodParam> _adaptionPeriodParams;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	/**
	* 判断是否匹配时区差
	*/
	bool MatchTimeZoneDiff(const Duty& duty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

	bool MatchTimeZoneDiffForRestStart(const Duty& duty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

	bool MatchAcclimatizationState(const Duty& duty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

	//匹配获得前一个Duty的休息开始时间适应状态
	bool MatchAcclimatizationStateForRestStart(const Duty& currDuty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

	/**
	* 基于Duty的开始时间为基准，获得转化周期（适应时间）的分钟数
	*/
	int GetAdaptionPeriod(const Duty& lastAcclimatisedDuty,
		const Duty& maxTimeZoneDiffDuty, const unsigned int maxTimeZoneDiff, const SharedPtr<CrewDataContext>& dbData) const;


};

#endif //_ACCLIMATIZATIONRULEPARAM_H_
