#ifndef NEWRULEENGINE_RULEPARAM_H
#define NEWRULEENGINE_RULEPARAM_H

#include "violationcollector/ViolationTypeDefine.h"
#include "Rule.h"
#include "StringUtil.h"

class RuleParam {
public:

	explicit RuleParam(const Rule* rule) :_rule(rule) {};

	virtual ~RuleParam() = default;

	bool operator==(const RuleParam& ruleParam)
	{
		return Equals(ruleParam);
	}

	bool operator==(const RuleParam& ruleParam) const
	{
		return Equals(ruleParam);
	}

	inline void SetId(const long long id) {
		_id = id;
	}

	inline const long long GetId() const {
		return _id;
	}

	inline void SetRuleParamId(const long long id) {
		_ruleParamId = id;
	}

	inline const long long GetRuleParamId() const {
		return _ruleParamId;
	}

	inline void SetPhase(const long long phase) {
		_phase = phase;
	}

	inline const long long GetPhase() const {
		return _phase;
	}

	inline void SetClassType(const std::string& classType) {
		_classType = classType;
	}

	inline const std::string& GetClassType() const {
		return _classType;
	}

	inline void SetSeverity(const ViolationSeverity& severity) {
		_severity = severity;
	}

	inline const ViolationSeverity& GetSeverity() const {
		return _severity;
	}

	inline void SetSource(const std::string& source) {
		_source = source;
	}

	inline const std::string& GetSource() const {
		return _source;
	}

	inline void SetReference(const std::string& reference) {
		_reference = reference;
	}

	inline const std::string& GetReference() const {
		return _reference;
	}

	inline void SetCategory(const std::string& category) {
		_category = category;
	}

	inline const std::string& GetCategory() const {
		return _category;
	}

	inline void SetOverrideAbility(const std::string& overrideAbility) {
		_overrideAbility = overrideAbility;
	}

	inline const std::string& GetOverrideAbility() const {
		return _overrideAbility;
	}

	inline void SetExceptionCode(const std::string& exceptionCode) {
		_exceptionCode = exceptionCode;
		if (_exceptionCode.empty()) {
			_exceptionCodes.clear();
		}
		else {
			split(_exceptionCode.c_str(), '|', _exceptionCodes);
		}
	}

	inline const std::string& GetExceptionCode() const {
		return _exceptionCode;
	}

	inline const std::set<std::string>& GetExceptionCodes() const {
		return _exceptionCodes;
	}

	inline void SetDescription(const std::string description) {
		_description = description;
	}

	inline const std::string& GetDescription() const {
		return _description;
	}

	inline std::string GetViolationHeader() const {
		const std::string ref = trim(_reference);
		const std::string cat = trim(_category);
		if (!ref.empty() && !cat.empty()) {
			return "[" + ref + "][" + cat + "]";
		}
		if (!ref.empty()) {
			return "[" + ref + "]";
		}
		if (!cat.empty()) {
			return "[" + cat + "]";
		}
		return {};
	}

protected:

	const Rule* GetRule() const {
		return _rule;
	}

	virtual bool Equals(const RuleParam& ruleParam) const {
		return (ruleParam.GetId() == this->GetId()) && (ruleParam.GetRuleParamId() == this->GetRuleParamId());
	}

	virtual void ParseParam(const std::string& paramString) {

	}

	virtual void ParseParam(const DBRule& dbRule) {
		this->SetId(dbRule.idRule);
		this->SetRuleParamId(dbRule.idRuleParam);
		this->SetPhase(dbRule.phase);
		this->SetClassType(dbRule.classType);
		this->SetSource(dbRule.source);
		this->SetReference(dbRule.reference);
		this->SetCategory(dbRule.category);
		this->SetOverrideAbility(dbRule.overridebility);
		this->SetDescription(dbRule.description);
		this->SetExceptionCode(dbRule.exceptionCode);
	}

private:
	const Rule* _rule;

	long long _id{ };

	long long _ruleParamId{ };

	long long _phase = 0;//phase id

	string _classType{"B"};//RuleClassType中定义，取值：P、R、B

	ViolationSeverity _severity{ DefaultSeverity };

	std::string _description{};

	std::string _source{};

	std::string _reference{};

	std::string _category{};

	std::string _overrideAbility{};

	std::string _exceptionCode{};

	std::set<std::string> _exceptionCodes{};

};

#endif //NEWRULEENGINE_RULEPARAM_H
