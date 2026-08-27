#pragma once

#include <vector>
#include <algorithm>

class EqualUtils {

public:

    template<typename T>
    static bool IsEqual(std::vector<T> const& v1, std::vector<T> const& v2)
    {
        auto tmpV1 = v1;
        auto tmpV2 = v2;
        std::sort(tmpV1.begin(), tmpV1.end());
        std::sort(tmpV2.begin(), tmpV2.end());
        return (tmpV1.size() == tmpV2.size() &&
            std::equal(tmpV1.begin(), tmpV1.end(), tmpV2.begin()));
    }
};