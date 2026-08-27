#ifndef _MINIMUM_LEGAL_COMPLEMENT_TYPES_H_
#define _MINIMUM_LEGAL_COMPLEMENT_TYPES_H_

#include <vector>

class Duty;

enum class MinimumLegalComplementCoverage {
	None = 0,
	Partial = 1,
	Full = 2
};

struct MinimumLegalComplementOption {
	std::string compositionName;
	MinimumLegalComplementCoverage coverage = MinimumLegalComplementCoverage::None;
};

struct MinimumLegalComplementRange {
	std::vector<MinimumLegalComplementOption> options;
};

class MinimumLegalComplementCoverageRule {
public:
	virtual ~MinimumLegalComplementCoverageRule() = default;
	virtual MinimumLegalComplementCoverage getMinimumLegalComplementCoverage(const Duty* duty) const = 0;
};

#endif // _MINIMUM_LEGAL_COMPLEMENT_TYPES_H_
